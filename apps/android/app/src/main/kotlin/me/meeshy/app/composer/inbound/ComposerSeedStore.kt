package me.meeshy.app.composer.inbound

import android.content.Context
import android.util.Base64
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.composer.host.ComposerHostRoute
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.composer.InboundMediaPolicy
import me.meeshy.sdk.model.composer.InboundMediaVerdict
import java.io.File
import java.security.SecureRandom
import javax.inject.Inject
import javax.inject.Singleton

/**
 * **Le relais entre l'entrée externe et l'hôte du composeur** (#13527) — l'équivalent Android de la fiche que l'extension
 * de partage iOS dépose dans l'App Group. Ce qui y entre est du contenu NON FIABLE déjà jugé ([InboundMediaReader]) :
 * il vit dans le cache PRIVÉ de l'application (jamais une URI `content://` gardée au-delà de l'usage), sous un nom que
 * Meeshy choisit (l'indice de l'expéditeur ne sert à aucun chemin), derrière un jeton de 128 bits tiré de [SecureRandom].
 *
 * - **Usage unique** : [take] reprend puis efface le dépôt. Un jeton rejoué, périmé ([TTL_MS]) ou inconnu ne rend rien.
 * - **Jamais en mémoire** (#13551) : [take] rend des médias ADOSSÉS À UN FICHIER, déplacés (pas copiés) dans [staged] du même
 *   cache privé ; une vidéo de 200 Mo part en flux sans qu'aucun tableau de sa taille n'existe. Ces fichiers vivent le temps
 *   d'une composition ([STAGED_TTL_MS]) et quittent le disque à la déconnexion ([clearAll]).
 * - **Aucun chemin forgé** : le jeton a la forme de [ComposerHostRoute.seedToken], et le dossier résolu doit être un
 *   enfant direct de la racine (canonique) — `..`, `/` et liens n'en sortent pas.
 * - **Rien ne se publie ici** : le store ne fait que tenir des octets ; c'est le geste de l'auteur, dans l'hôte, qui publie.
 */
@Singleton
class ComposerSeedStore internal constructor(
    private val root: File,
    private val now: () -> Long,
    private val random: SecureRandom,
    private val staged: File = File(root.parentFile, STAGED_DIRECTORY),
) {
    @Inject
    constructor(@ApplicationContext context: Context) : this(File(context.cacheDir, DIRECTORY), System::currentTimeMillis, SecureRandom())

    /**
     * Copie [sources] (au plus [MAX_ITEMS]) dans le cache privé, jugées une à une ([InboundMediaReader]) — aucune n'est tenue en
     * mémoire — et rend le jeton qui les reprend ; `null` si aucune n'est admissible ou si le disque refuse.
     */
    fun stash(sources: List<InboundSource>): String? {
        val picked = sources.take(MAX_ITEMS).ifEmpty { return null }
        purgeExpired()
        val token = newToken()
        val directory = File(root, token)
        val kept = runCatching {
            check(directory.mkdirs())
            var count = 0
            picked.forEach { source ->
                val part = File(directory, "$count.part")
                val copy = InboundMediaReader.copy(source, part) as? InboundCopy.Stored ?: return@forEach
                if (part.renameTo(File(directory, "$count.${copy.media.extension}"))) count++ else part.delete()
            }
            directory.setLastModified(now())
            count
        }.getOrDefault(0)
        if (kept == 0) {
            directory.deleteRecursively()
            return null
        }
        return token
    }

    /**
     * Reprend les médias du jeton, UNE fois : le dossier est effacé dans le même geste. Vide pour un jeton inconnu, rejoué ou
     * périmé. Chaque média rendu est un fichier de [staged], lu par en-tête seulement (jamais chargé).
     */
    fun take(token: String?): List<MediaUploadItem> {
        val directory = directoryOf(token) ?: return emptyList()
        if (!directory.isDirectory) return emptyList()
        val items = if (now() - directory.lastModified() > TTL_MS) emptyList() else stageItems(directory, directory.name)
        directory.deleteRecursively()
        return items
    }

    /** Le jeton désigne-t-il un dépôt vivant ? Sans le consommer. */
    fun holds(token: String?): Boolean {
        purgeExpired()
        return directoryOf(token)?.let { it.isDirectory && now() - it.lastModified() <= TTL_MS } == true
    }

    fun discard(token: String?) {
        directoryOf(token)?.deleteRecursively()
    }

    /** Efface TOUT dépôt : la déconnexion ou le changement de compte ne laisse rien du média reçu par le compte quitté ([ComposerSeedTeardown]). */
    fun clearAll() {
        root.listFiles().orEmpty().forEach { it.deleteRecursively() }
        staged.listFiles().orEmpty().forEach { it.deleteRecursively() }
    }

    /** Efface tout dépôt plus vieux que [TTL_MS] : un partage qu'aucun hôte n'a repris (processus tué) ne reste pas sur le disque. */
    fun purgeExpired() {
        root.listFiles().orEmpty().filter { now() - it.lastModified() > TTL_MS }.forEach { it.deleteRecursively() }
        staged.listFiles().orEmpty().filter { now() - it.lastModified() > STAGED_TTL_MS }.forEach { it.deleteRecursively() }
    }

    private fun directoryOf(token: String?): File? {
        val valid = ComposerHostRoute.seedToken(token) ?: return null
        val directory = File(root, valid)
        val inside = runCatching { directory.canonicalFile.parentFile == root.canonicalFile }.getOrDefault(false)
        return directory.takeIf { inside }
    }

    private fun stageItems(directory: File, token: String): List<MediaUploadItem> =
        directory.listFiles().orEmpty()
            .filter { it.isFile && ITEM_NAME.matches(it.name) }
            .sortedBy { it.name.substringBefore('.').toInt() }
            .mapNotNull { file -> runCatching { stage(file, token) }.getOrNull() }

    private fun stage(file: File, token: String): MediaUploadItem? {
        val size = file.length()
        val header = file.inputStream().use { it.readNBytesCompat(InboundMediaPolicy.HEADER_BYTES) }
        val admitted = InboundMediaPolicy.judge(header, size, null) as? InboundMediaVerdict.Admitted ?: return null
        val index = file.name.substringBefore('.').toInt()
        check(staged.isDirectory || staged.mkdirs())
        val target = File(staged, "$token-$index.${admitted.extension}")
        if (!file.renameTo(target)) return null
        target.setLastModified(now())
        return MediaUploadItem.onDisk(target, fileName = "shared-${index + 1}.${admitted.extension}", mimeType = admitted.mimeType)
    }

    private fun java.io.InputStream.readNBytesCompat(count: Int): ByteArray {
        val out = ByteArray(count)
        var done = 0
        while (done < count) {
            val read = read(out, done, count - done)
            if (read < 0) break
            done += read
        }
        return out.copyOf(done)
    }

    private fun newToken(): String = Base64.encodeToString(ByteArray(TOKEN_BYTES).also(random::nextBytes), Base64.NO_WRAP or Base64.NO_PADDING or Base64.URL_SAFE)

    companion object {
        const val DIRECTORY = "composer-inbound"
        const val MAX_ITEMS = 10
        const val TTL_MS = 30L * 60_000L
        const val STAGED_DIRECTORY = "composer-staged"
        const val STAGED_TTL_MS = 24L * 60L * 60_000L
        private const val TOKEN_BYTES = 16
        private val ITEM_NAME = Regex("\\d{1,2}\\.[a-z0-9]{2,5}")
    }
}
