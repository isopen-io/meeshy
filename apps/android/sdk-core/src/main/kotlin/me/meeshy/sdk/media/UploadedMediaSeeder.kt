package me.meeshy.sdk.media

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.util.resolveMediaUrl
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Ensemencement du cache après un envoi (#13861, #13876), miroir de `TusUploadManager.seedMediaCache` (iOS) : les
 * octets qui viennent de partir entrent au cache d'images, audio ou vidéo sous l'adresse RÉSOLUE ([resolveMediaUrl]) —
 * celle que la bulle, le lecteur et les stories lisent — pour que l'auteur revoie son propre média sans le
 * retélécharger.
 *
 * Les images, les sons et les vidéos s'adoptent ; un document, non. Un fichier dont le serveur annonce une autre
 * taille que celle envoyée n'est pas adopté : le serveur l'a réécrit (métadonnées retirées, image recompressée, piste
 * extraite), et ce sont SES octets que les lectures doivent servir. Une adoption qui échoue ne fait jamais échouer
 * l'envoi : la première lecture repasse alors par le réseau, comme avant.
 */
@Singleton
public class UploadedMediaSeeder internal constructor(
    private val cache: UploadedMediaCache,
    private val apiBaseUrl: () -> String?,
    private val io: CoroutineDispatcher,
) {
    @Inject
    public constructor(cache: UploadedMediaCache, config: MeeshyConfig) : this(cache, { config.apiBaseUrl }, Dispatchers.IO)

    /** Adopte les octets [sent] comme la ressource de [uploaded] : une image, un son ou une vidéo gardé tel quel. */
    public suspend fun seed(sent: MediaUploadItem, uploaded: UploadedMedia) {
        val category = categoryOf(uploaded.mimeType) ?: return
        val length = sent.sizeBytes
        if (length <= 0L || uploaded.fileSize != length) return
        val url = resolveMediaUrl(uploaded.url, apiBaseUrl())
        try {
            withContext(io) { cache.adopt(category, url, length) { sent.source.open() } }
        } catch (failure: CancellationException) {
            throw failure
        } catch (failure: Exception) {
            Timber.w(failure, "Seeding the media cache after an upload failed")
        }
    }

    private fun categoryOf(mimeType: String): MediaCacheCategory? = when {
        mimeType.startsWith("image/") -> MediaCacheCategory.IMAGES
        mimeType.startsWith("audio/") -> MediaCacheCategory.AUDIO
        mimeType.startsWith("video/") -> MediaCacheCategory.VIDEO
        else -> null
    }

    public companion object {
        public val None: UploadedMediaSeeder = UploadedMediaSeeder(UploadedMediaCache.None, { null }, Dispatchers.Unconfined)
    }
}
