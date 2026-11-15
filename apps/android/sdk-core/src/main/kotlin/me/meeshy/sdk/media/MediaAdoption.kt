package me.meeshy.sdk.media

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.media.AttachmentKind
import me.meeshy.sdk.model.media.LocalFileUrl
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.util.resolveMediaUrl
import timber.log.Timber
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * **À l'accusé du serveur, le fichier local d'un média envoyé rejoint le cache typé** (miroir de l'adoption SDK iOS) :
 * quand le `fileUrl` d'une pièce passe de `file://` (bulle optimiste) à son adresse servie — absolue, ou relative comme la
 * passerelle la rend (`/api/v1/static/…`, résolue sur la même base que la bulle, #15428) —, les octets déjà
 * sur l'appareil sont rangés sous la clé canonique — la lecture suivante est un hit disque instantané, sans retélécharger
 * ce qu'on vient d'envoyer. Le fichier de la file est supprimé après adoption (s'il appartient à l'app, [owned]).
 *
 * Ne fait RIEN quand : la pièce n'avait pas de `file://` (message reçu, rafraîchissement), la nouvelle adresse n'est pas
 * http(s) (envoi échoué : toujours optimiste), le fichier local a disparu, la pièce est un document ou une localisation
 * (pas de cache typé), ou la clé est déjà sur disque. Une adoption qui échoue ne fait jamais échouer l'accusé.
 */
@Singleton
class MediaAdoption internal constructor(
    private val cache: TypedMediaCache,
    private val apiBaseUrl: () -> String?,
    private val owned: (File) -> Boolean,
    private val io: CoroutineDispatcher,
) {
    @Inject
    constructor(cache: TypedMediaCache, config: MeeshyConfig, ownedRoots: OwnedMediaRoots) :
        this(cache, { config.apiBaseUrl }, ownedRoots::owns, Dispatchers.IO)

    /** Adopte, pour chaque pièce accusée, le fichier de sa jumelle optimiste. Rend le nombre de fichiers adoptés. */
    suspend fun adopt(optimistic: List<ApiMessageAttachment>, acked: List<ApiMessageAttachment>): Int {
        val pairs = pair(optimistic, acked)
        var adopted = 0
        for ((local, server) in pairs) {
            try {
                if (adoptOne(local, server)) adopted++
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.w(failure, "Adopting an acked attachment failed")
            }
        }
        return adopted
    }

    private suspend fun adoptOne(local: ApiMessageAttachment, server: ApiMessageAttachment): Boolean {
        val previous = local.fileUrl.orEmpty()
        val canonical = server.fileUrl.orEmpty()
        if (!LocalFileUrl.isLocal(previous) || canonical.isEmpty() || LocalFileUrl.isLocal(canonical)) return false
        val key = resolveMediaUrl(canonical, apiBaseUrl())
        if (!(key.startsWith("http://") || key.startsWith("https://"))) return false
        val category = categoryOf(server.mimeType ?: local.mimeType) ?: return false
        val source = LocalFileUrl.pathOf(previous)?.let(::File) ?: return false
        return withContext(io) {
            if (!source.isFile || source.length() <= 0L) return@withContext false
            if (cache.contains(category, key)) {
                if (owned(source)) source.delete()
                return@withContext false
            }
            val movable = owned(source)
            val staged = if (movable) source else source.copyTo(File(cache.stagingDir(category), source.name + ".adopt"), overwrite = true)
            cache.store(category, key, staged)
            true
        }
    }

    private fun pair(optimistic: List<ApiMessageAttachment>, acked: List<ApiMessageAttachment>): List<Pair<ApiMessageAttachment, ApiMessageAttachment>> {
        val byId = optimistic.associateBy { it.id }
        val sameShape = optimistic.size == acked.size
        return acked.mapIndexedNotNull { index, server ->
            val local = byId[server.id] ?: optimistic.getOrNull(index).takeIf { sameShape }
            local?.let { it to server }
        }
    }

    private fun categoryOf(mime: String?): MediaCacheCategory? = when (AttachmentKind.fromMime(mime)) {
        AttachmentKind.IMAGE -> MediaCacheCategory.IMAGES
        AttachmentKind.AUDIO -> MediaCacheCategory.AUDIO
        AttachmentKind.VIDEO -> MediaCacheCategory.VIDEO
        else -> null
    }
}

/** Les racines que l'app possède (stockage privé) : un fichier qui y vit peut être déplacé puis supprimé sans toucher à la galerie. */
class OwnedMediaRoots(private val roots: List<File>) {
    fun owns(file: File): Boolean {
        val path = runCatching { file.canonicalPath }.getOrNull() ?: return false
        return roots.any { root -> path.startsWith(root.canonicalPath + File.separator) }
    }
}
