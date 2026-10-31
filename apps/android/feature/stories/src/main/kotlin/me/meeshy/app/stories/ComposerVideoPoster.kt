package me.meeshy.app.stories

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.LruCache
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.media.previewModel
import me.meeshy.sdk.model.UploadedMedia

/**
 * Une image À EXTRAIRE d'une vidéo (#13863) : l'instant [atMs] de la vidéo à [address]. Un chargeur d'images ne sait pas
 * décoder une vidéo — remise à Coil, son adresse ne peint rien (« Failed to create image decoder », recette S8 du
 * 2026-10-31) : la vignette des Médias restait vide, la vidéo posée était une carte grise.
 */
internal data class ComposerVideoFrame(val address: String, val atMs: Long = 0)

/** Ce qui représente un média du compositeur à l'écran : sa vignette servie, l'image elle-même, ou l'image d'une vidéo. */
internal object ComposerPicture {

    fun of(media: UploadedMedia, apiBaseUrl: String?, atMs: Long = 0): Any = when {
        !media.isVideo || !media.thumbnailUrl.isNullOrBlank() -> ComposerMediaAddress.preview(media, apiBaseUrl)
        else -> ComposerVideoFrame(ComposerMediaAddress.of(media.url, apiBaseUrl), atMs)
    }

    /** Un envoi en attente : son fichier, ou pour une vidéo gardée sur l'appareil l'image de son début. */
    fun of(item: MediaUploadItem, atMs: Long = 0): Any? {
        if (!item.mimeType.startsWith(VIDEO, ignoreCase = true)) return item.previewModel
        val file = (item.source as? MediaUploadSource.OnDisk)?.file ?: return null
        return ComposerVideoFrame(Uri.fromFile(file).toString(), atMs)
    }

    private val UploadedMedia.isVideo: Boolean get() = mimeType.startsWith(VIDEO, ignoreCase = true)

    private const val VIDEO = "video"
}

/** L'image que peint un chargeur d'images pour [model] : telle quelle, ou extraite de la vidéo (`null` le temps de la décoder). */
@Composable
internal fun rememberComposerPicture(model: Any?): Any? {
    val frame = model as? ComposerVideoFrame ?: return model
    val context = LocalContext.current
    val bitmap by produceState(VideoFrames.cached(frame), frame) {
        value = VideoFrames.cached(frame) ?: withContext(Dispatchers.IO) { VideoFrames.extract(context, frame) }
    }
    return bitmap
}

/** Les images extraites, gardées le temps de la composition : une vignette et la scène ne décodent pas deux fois la même. */
private object VideoFrames {
    private val cache = LruCache<ComposerVideoFrame, Bitmap>(CACHED_FRAMES)

    fun cached(frame: ComposerVideoFrame): Bitmap? = cache.get(frame)

    fun extract(context: Context, frame: ComposerVideoFrame): Bitmap? {
        val retriever = MediaMetadataRetriever()
        return try {
            val uri = Uri.parse(frame.address)
            when (uri.scheme?.lowercase()) {
                "file" -> retriever.setDataSource(uri.path)
                "content", "android.resource" -> retriever.setDataSource(context, uri)
                else -> retriever.setDataSource(frame.address, emptyMap())
            }
            val image = retriever.getFrameAtTime(frame.atMs * MICROS_PER_MILLI, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            image?.scaledWithin(MAX_SIDE_PX)?.also { cache.put(frame, it) }
        } catch (_: Exception) {
            null
        } finally {
            runCatching { retriever.release() }
        }
    }

    private fun Bitmap.scaledWithin(maxSide: Int): Bitmap {
        val longest = maxOf(width, height)
        if (longest <= maxSide || longest == 0) return this
        val ratio = maxSide.toFloat() / longest
        return Bitmap.createScaledBitmap(this, (width * ratio).toInt().coerceAtLeast(1), (height * ratio).toInt().coerceAtLeast(1), true)
    }

    private const val CACHED_FRAMES = 12
    private const val MAX_SIDE_PX = 540
    private const val MICROS_PER_MILLI = 1_000L
}
