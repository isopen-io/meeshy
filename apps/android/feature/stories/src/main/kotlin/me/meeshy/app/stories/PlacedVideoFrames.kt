package me.meeshy.app.stories

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlin.coroutines.coroutineContext

private const val FRAME_COUNT = 8
private const val FRAME_HEIGHT_PX = 96
private const val MICROS_PER_SECOND = 1_000_000L

/**
 * Les instants (en microsecondes) où la bande de rognage prend ses vignettes : [count] points au milieu de tranches
 * égales de la source, jamais la dernière image (souvent noire). Pure.
 */
internal fun trimFrameTimesMicros(sourceSeconds: Double, count: Int = FRAME_COUNT): List<Long> {
    if (!(sourceSeconds > 0.0) || count <= 0) return emptyList()
    return List(count) { index -> ((index + 0.5) / count * sourceSeconds * MICROS_PER_SECOND).toLong() }
}

/**
 * Les vignettes de la source de la vidéo [url], décodées hors du fil principal (la bande se montre à l'instant, vide, puis
 * se garnit). Un échec de lecture laisse la bande sans vignettes : le rognage reste utilisable.
 */
@Composable
internal fun rememberVideoFrames(url: String, sourceSeconds: Double): List<ImageBitmap> {
    val frames by produceState(initialValue = emptyList<ImageBitmap>(), url, sourceSeconds) {
        value = withContext(Dispatchers.IO) { extractFrames(url, sourceSeconds) }
    }
    return frames
}

private suspend fun extractFrames(url: String, sourceSeconds: Double): List<ImageBitmap> {
    val retriever = MediaMetadataRetriever()
    return try {
        runCatching { retriever.setDataSource(url, emptyMap()) }.getOrElse { return emptyList() }
        trimFrameTimesMicros(sourceSeconds).mapNotNull { at ->
            coroutineContext.ensureActive()
            runCatching { retriever.getFrameAtTime(at, MediaMetadataRetriever.OPTION_CLOSEST_SYNC) }.getOrNull()?.scaledToHeight()
        }
    } finally {
        runCatching { retriever.release() }
    }
}

private fun Bitmap.scaledToHeight(): ImageBitmap {
    if (height <= FRAME_HEIGHT_PX || height == 0) return asImageBitmap()
    val width = (width.toLong() * FRAME_HEIGHT_PX / height).toInt().coerceAtLeast(1)
    return Bitmap.createScaledBitmap(this, width, FRAME_HEIGHT_PX, true).asImageBitmap()
}
