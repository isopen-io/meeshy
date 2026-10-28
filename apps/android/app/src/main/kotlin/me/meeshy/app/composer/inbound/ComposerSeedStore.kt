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
 * - **Usage unique** : [take] lit puis efface. Un jeton rejoué, périmé ([TTL_MS]) ou inconnu ne rend rien.
 * - **Aucun chemin forgé** : le jeton a la forme de [ComposerHostRoute.seedToken], et le dossier résolu doit être un
 *   enfant direct de la racine (canonique) — `..`, `/` et liens n'en sortent pas.
 * - **Rien ne se publie ici** : le store ne fait que tenir des octets ; c'est le geste de l'auteur, dans l'hôte, qui publie.
 */
@Singleton
class ComposerSeedStore internal constructor(
    private val root: File,
    private val now: () -> Long,
    private val random: SecureRandom,
) {
    @Inject
    constructor(@ApplicationContext context: Context) : this(File(context.cacheDir, DIRECTORY), System::currentTimeMillis, SecureRandom())

    /** Dépose [media] (au plus [MAX_ITEMS]) et rend le jeton qui les reprend ; `null` s'il n'y a rien à déposer ou si le disque refuse. */
    fun stash(media: List<InboundMedia>): String? {
        val items = media.take(MAX_ITEMS).ifEmpty { return null }
        purgeExpired()
        val token = newToken()
        val directory = File(root, token)
        val written = runCatching {
            check(directory.mkdirs())
            items.forEachIndexed { index, item -> File(directory, "$index.${item.extension}").writeBytes(item.bytes) }
            directory.setLastModified(now())
        }.isSuccess
        if (!written) {
            directory.deleteRecursively()
            return null
        }
        return token
    }

    /** Reprend les médias du jeton, UNE fois : le dossier est effacé dans le même geste. Vide pour un jeton inconnu, rejoué ou périmé. */
    fun take(token: String?): List<MediaUploadItem> {
        val directory = directoryOf(token) ?: return emptyList()
        if (!directory.isDirectory) return emptyList()
        val items = if (now() - directory.lastModified() > TTL_MS) emptyList() else readItems(directory)
        directory.deleteRecursively()
        return items
    }

    /** Le jeton désigne-t-il un dépôt vivant ? Sans le consommer. */
    fun holds(token: String?): Boolean =
        directoryOf(token)?.let { it.isDirectory && now() - it.lastModified() <= TTL_MS } == true

    fun discard(token: String?) {
        directoryOf(token)?.deleteRecursively()
    }

    /** Efface tout dépôt plus vieux que [TTL_MS] : un partage qu'aucun hôte n'a repris (processus tué) ne reste pas sur le disque. */
    fun purgeExpired() {
        root.listFiles().orEmpty().filter { now() - it.lastModified() > TTL_MS }.forEach { it.deleteRecursively() }
    }

    private fun directoryOf(token: String?): File? {
        val valid = ComposerHostRoute.seedToken(token) ?: return null
        val directory = File(root, valid)
        val inside = runCatching { directory.canonicalFile.parentFile == root.canonicalFile }.getOrDefault(false)
        return directory.takeIf { inside }
    }

    private fun readItems(directory: File): List<MediaUploadItem> =
        directory.listFiles().orEmpty()
            .filter { it.isFile && ITEM_NAME.matches(it.name) }
            .sortedBy { it.name.substringBefore('.').toInt() }
            .mapNotNull { file ->
                val bytes = runCatching { file.readBytes() }.getOrNull() ?: return@mapNotNull null
                val verdict = InboundMediaPolicy.judge(bytes.copyOf(minOf(bytes.size, InboundMediaPolicy.HEADER_BYTES)), bytes.size.toLong(), null)
                (verdict as? InboundMediaVerdict.Admitted)?.let {
                    MediaUploadItem(bytes = bytes, fileName = "shared-${file.name.substringBefore('.').toInt() + 1}.${it.extension}", mimeType = it.mimeType)
                }
            }

    private fun newToken(): String = Base64.encodeToString(ByteArray(TOKEN_BYTES).also(random::nextBytes), Base64.NO_WRAP or Base64.NO_PADDING or Base64.URL_SAFE)

    companion object {
        const val DIRECTORY = "composer-inbound"
        const val MAX_ITEMS = 10
        const val TTL_MS = 30L * 60_000L
        private const val TOKEN_BYTES = 16
        private val ITEM_NAME = Regex("\\d{1,2}\\.[a-z0-9]{2,5}")
    }
}
