package me.meeshy.app.calls

import android.graphics.Bitmap
import android.graphics.Matrix
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.call.montage.CallCaptureSubject
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import org.webrtc.VideoTrack

/** Une image de piste copiée hors du tampon WebRTC (I420), avec la rotation que la caméra annonce. */
class CallCapturePlanes(
    val width: Int,
    val height: Int,
    val y: ByteArray,
    val strideY: Int,
    val u: ByteArray,
    val strideU: Int,
    val v: ByteArray,
    val strideV: Int,
    val rotation: Int,
)

/** I420 (BT.601, plage limitée) → ARGB, en Kotlin pur : la piste n'offre pas de conversion vers l'ARGB. */
object CallCaptureYuv {
    fun toArgb(planes: CallCapturePlanes): IntArray {
        val out = IntArray(planes.width * planes.height)
        for (row in 0 until planes.height) {
            val yRow = row * planes.strideY
            val uRow = (row / 2) * planes.strideU
            val vRow = (row / 2) * planes.strideV
            for (col in 0 until planes.width) {
                val c = (planes.y[yRow + col].toInt() and 0xFF) - 16
                val d = (planes.u[uRow + col / 2].toInt() and 0xFF) - 128
                val e = (planes.v[vRow + col / 2].toInt() and 0xFF) - 128
                val r = clamp((298 * c + 409 * e + 128) shr 8)
                val g = clamp((298 * c - 100 * d - 208 * e + 128) shr 8)
                val b = clamp((298 * c + 516 * d + 128) shr 8)
                out[row * planes.width + col] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
        }
        return out
    }

    fun orientedSize(width: Int, height: Int, rotation: Int): Pair<Int, Int> =
        if (rotation % 180 == 0) width to height else height to width

    /** La taille réduite pour que le plus grand côté tienne dans [maxDimension] (paire, jamais agrandie). */
    fun scaledSize(width: Int, height: Int, maxDimension: Int?): Pair<Int, Int> {
        val longest = max(width, height)
        if (maxDimension == null || longest <= maxDimension) return width to height
        val factor = maxDimension.toDouble() / longest
        return even(width * factor) to even(height * factor)
    }

    private fun even(value: Double): Int = max(value.roundToInt() and 1.inv(), 2)

    private fun clamp(value: Int): Int = value.coerceIn(0, 255)
}

/**
 * **LES IMAGES DES PISTES** — miroir de `CallFrameGrabber` (iOS) : chaque personne a un récepteur posé sur
 * sa piste. Aucune image n'est GARDÉE (garder un tampon de caméra bloquerait la capture de la caméra) :
 * une prise DEMANDE la prochaine image de chaque piste, qui la copie en I420 puis la rend aussitôt. La
 * conversion en pixels, la rotation et le miroir (ma caméra avant, comme je me vois) se font hors du fil
 * principal. Une piste muette au-delà de [WAIT_MILLIS] laisse sa case sans image.
 */
class CallCaptureFrameGrabber : CallCaptureFrameSource {
    private val taps = ConcurrentHashMap<String, Tap>()

    override fun attach(id: String, track: VideoTrack?) {
        val previous = taps[id]
        if (previous?.track === track) return
        previous?.detach()
        if (track == null) {
            taps.remove(id)
            return
        }
        val tap = Tap(track)
        taps[id] = tap
        runCatching { track.addSink(tap) }
    }

    override fun detachAll() {
        taps.values.forEach(Tap::detach)
        taps.clear()
    }

    override suspend fun snapshot(subjects: List<CallCaptureSubject>, maxDimension: Int?): Map<String, Bitmap> = coroutineScope {
        subjects.filter { it.showsVideo }.mapNotNull { subject -> taps[subject.id]?.let { subject to it } }
            .map { (subject, tap) ->
                async {
                    val planes = withTimeoutOrNull(WAIT_MILLIS) { tap.next(maxDimension) } ?: return@async null
                    withContext(Dispatchers.Default) { bitmap(planes, subject.isMirrored) }?.let { subject.id to it }
                }
            }
            .awaitAll()
            .filterNotNull()
            .toMap()
    }

    private fun bitmap(planes: CallCapturePlanes, mirrored: Boolean): Bitmap? = runCatching {
        val upright = Bitmap.createBitmap(CallCaptureYuv.toArgb(planes), planes.width, planes.height, Bitmap.Config.ARGB_8888)
        if (planes.rotation % 360 == 0 && !mirrored) return@runCatching upright
        val matrix = Matrix().apply {
            postRotate(planes.rotation.toFloat())
            if (mirrored) postScale(-1f, 1f)
        }
        Bitmap.createBitmap(upright, 0, 0, upright.width, upright.height, matrix, true).also { if (it !== upright) upright.recycle() }
    }.getOrNull()

    private class Tap(val track: VideoTrack) : VideoSink {
        private val waiting = ConcurrentHashMap<CompletableDeferred<CallCapturePlanes>, Int?>()

        suspend fun next(maxDimension: Int?): CallCapturePlanes {
            val request = CompletableDeferred<CallCapturePlanes>()
            waiting[request] = maxDimension
            try {
                return request.await()
            } finally {
                waiting.remove(request)
            }
        }

        override fun onFrame(frame: VideoFrame) {
            if (waiting.isEmpty()) return
            waiting.entries.toList().groupBy({ it.value }, { it.key }).forEach { (maxDimension, requests) ->
                val planes = runCatching { copy(frame, maxDimension) }.getOrNull() ?: return@forEach
                requests.forEach { it.complete(planes) }
            }
        }

        fun detach() {
            runCatching { track.removeSink(this) }
            waiting.keys.forEach { it.cancel() }
        }

        private fun copy(frame: VideoFrame, maxDimension: Int?): CallCapturePlanes {
            val source = frame.buffer
            val (width, height) = CallCaptureYuv.scaledSize(source.width, source.height, maxDimension)
            val scaled = if (width == source.width && height == source.height) null else source.cropAndScale(0, 0, source.width, source.height, width, height)
            val i420 = (scaled ?: source).toI420() ?: error("no I420 image")
            scaled?.release()
            try {
                return CallCapturePlanes(
                    width = i420.width,
                    height = i420.height,
                    y = i420.dataY.bytes(),
                    strideY = i420.strideY,
                    u = i420.dataU.bytes(),
                    strideU = i420.strideU,
                    v = i420.dataV.bytes(),
                    strideV = i420.strideV,
                    rotation = frame.rotation,
                )
            } finally {
                i420.release()
            }
        }

        private fun ByteBuffer.bytes(): ByteArray {
            val view = duplicate()
            view.rewind()
            return ByteArray(view.remaining()).also(view::get)
        }
    }

    private companion object {
        const val WAIT_MILLIS = 500L
    }
}
