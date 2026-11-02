package me.meeshy.app.stories

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import android.os.Build
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn

private const val FRAME_COUNT = 8
private const val FRAME_HEIGHT_PX = 96
private const val MICROS_PER_SECOND = 1_000_000L
private const val LOG_TAG = "MeeshyFrames"

/**
 * Les instants (en microsecondes) où la bande de rognage prend ses vignettes : [count] points au milieu de tranches
 * égales de la source, jamais la dernière image (souvent noire). Pure.
 */
internal fun trimFrameTimesMicros(sourceSeconds: Double, count: Int = FRAME_COUNT): List<Long> =
    windowFrameTimesMicros(0.0, sourceSeconds, count)

/** Les mêmes instants dans la seule fenêtre [startSeconds]…[endSeconds] de la source (la frise, #14268). Pure. */
internal fun windowFrameTimesMicros(startSeconds: Double, endSeconds: Double, count: Int = FRAME_COUNT): List<Long> {
    val span = endSeconds - startSeconds
    if (!(span > 0.0) || startSeconds < 0.0 || count <= 0) return emptyList()
    return List(count) { index -> ((startSeconds + (index + 0.5) / count * span) * MICROS_PER_SECOND).toLong() }
}

/**
 * Les vignettes de la source de la vidéo [url], décodées hors du fil principal : la bande se montre à l'instant, puis se
 * garnit VIGNETTE PAR VIGNETTE (#14300 — tout-ou-rien, elle restait vide les 8 s que le S8 met à décoder). Un échec de
 * lecture laisse la bande sans vignettes : le rognage reste utilisable.
 */
@Composable
internal fun rememberVideoFrames(url: String, sourceSeconds: Double): List<ImageBitmap> = rememberVideoFrames(url, 0.0, sourceSeconds)

/** Les vignettes de la seule fenêtre [startSeconds]…[endSeconds] de la vidéo [url] (la frise, #14268). */
@Composable
internal fun rememberVideoFrames(url: String, startSeconds: Double, endSeconds: Double): List<ImageBitmap> {
    val key = FramesKey(url, startSeconds, endSeconds)
    val frames by produceState(initialValue = remembered[key].orEmpty(), key) {
        if (remembered[key] != null) return@produceState
        val times = windowFrameTimesMicros(startSeconds, endSeconds)
        framesOf(url, times).flowOn(Dispatchers.IO).collect { value = it }
        Log.i(LOG_TAG, "vignettes ${value.size}/${times.size}")
        if (value.size == times.size && value.isNotEmpty()) remembered.put(key, value)
    }
    return frames
}

private data class FramesKey(val url: String, val start: Double, val end: Double)

private val remembered = BoundedMemory<FramesKey, List<ImageBitmap>>(capacity = 12)

private fun framesOf(url: String, times: List<Long>): Flow<List<ImageBitmap>> = flow {
    if (url.isBlank() || times.isEmpty()) return@flow
    val retriever = MediaMetadataRetriever()
    try {
        if (runCatching { retriever.setDataSource(url, emptyMap()) }.isFailure) return@flow
        // Le repli à l'échelle (API 27+) quand le décodage nominal rend `null` : certains décodeurs système refusent la
        // conversion pleine taille d'une image qu'ils savent rendre réduite.
        val grabs = listOf<(Long) -> ImageBitmap?>(
            { at -> runCatching { retriever.getFrameAtTime(at, MediaMetadataRetriever.OPTION_CLOSEST_SYNC) }.getOrNull()?.scaledToHeight() },
            { at -> retriever.scaledFrameAt(at)?.scaledToHeight() },
        )
        VideoFrameCollector.partials(times, grabs).forEach { partial ->
            currentCoroutineContext().ensureActive()
            emit(partial)
        }
    } finally {
        runCatching { retriever.release() }
    }
}

private fun MediaMetadataRetriever.scaledFrameAt(micros: Long): Bitmap? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) return null
    return runCatching { getScaledFrameAtTime(micros, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, FRAME_HEIGHT_PX * 2, FRAME_HEIGHT_PX) }.getOrNull()
}

private fun Bitmap.scaledToHeight(): ImageBitmap {
    if (height <= FRAME_HEIGHT_PX || height == 0) return asImageBitmap()
    val width = (width.toLong() * FRAME_HEIGHT_PX / height).toInt().coerceAtLeast(1)
    return Bitmap.createScaledBitmap(this, width, FRAME_HEIGHT_PX, true).asImageBitmap()
}
