package me.meeshy.app.chat.share

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import java.io.File
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.share.ShareMedia
import me.meeshy.sdk.model.share.SharePieceKind

/** Rend la vignette d'une pièce entrante, réduite à [maxPixels] ; nul = la tuile garde son glyphe. */
internal typealias ShareThumbnailLoader = suspend (media: ShareMedia, maxPixels: Int) -> ImageBitmap?

/**
 * **Les vignettes sont décodées RÉDUITES, hors du fil principal** (iOS `ShareIncomingThumbnail`) : une photo
 * de 48 Mpx décodée entière crèverait à elle seule le plafond mémoire d'un partage de cent pièces.
 * `inSampleSize` réduit pendant le décodage ; un fichier illisible rend `null`.
 */
internal object ShareThumbnailDecoder {

    suspend fun load(
        file: File,
        kind: SharePieceKind,
        maxPixels: Int,
        context: CoroutineContext = Dispatchers.IO,
    ): ImageBitmap? = withContext(context) {
        runCatching {
            when (kind) {
                SharePieceKind.IMAGE -> downsampledImage(file, maxPixels)
                SharePieceKind.VIDEO -> videoPoster(file, maxPixels)
                SharePieceKind.AUDIO, SharePieceKind.FILE -> null
            }?.asImageBitmap()
        }.getOrNull()
    }

    private fun downsampledImage(file: File, maxPixels: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, maxPixels) }
        return BitmapFactory.decodeFile(file.path, options)
    }

    private fun videoPoster(file: File, maxPixels: Int): Bitmap? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.path)
            val frame = retriever.getFrameAtTime(0L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC) ?: return null
            val longest = maxOf(frame.width, frame.height)
            if (longest <= maxPixels) frame else {
                val ratio = maxPixels.toFloat() / longest
                Bitmap.createScaledBitmap(frame, (frame.width * ratio).toInt().coerceAtLeast(1), (frame.height * ratio).toInt().coerceAtLeast(1), true)
            }
        } finally {
            retriever.release()
        }
    }

    /** La plus grande puissance de deux qui garde le côté le plus long au moins égal à [maxPixels]. */
    internal fun sampleSize(width: Int, height: Int, maxPixels: Int): Int {
        var sample = 1
        val longest = maxOf(width, height)
        while (longest / (sample * 2) >= maxPixels) sample *= 2
        return sample
    }
}
