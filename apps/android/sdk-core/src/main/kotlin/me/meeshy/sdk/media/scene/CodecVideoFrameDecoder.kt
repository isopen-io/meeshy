package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.media.Image
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.SystemClock
import java.io.File

/**
 * **Le décodeur d'une vidéo posée** (#13897) : `MediaExtractor` + `MediaCodec` en sortie mémoire (YUV 4:2:0 flexible), lu
 * dans l'ordre par [SequentialVideoFrames]. Une image ne se convertit que si on la montre ([YuvFrameConverter], à
 * [maxLongSide] pixels au plus, debout), et toujours dans les mêmes tampons ([VideoFrameBuffers] : un bitmap réécrit). [next] ne tient jamais le fil plus de [NEXT_BUDGET_MILLIS] : au-delà il rend `null`,
 * et la vidéo garde sa dernière image plutôt que d'arrêter le muxer. Un fichier sans piste vidéo lisible lève à l'ouverture.
 */
internal class CodecVideoFrameDecoder(file: File, private val maxLongSide: Int) : VideoFrameDecoder {

    private val extractor = MediaExtractor().apply { setDataSource(file.absolutePath) }
    private val track = (0 until extractor.trackCount).firstOrNull { index ->
        extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME)?.startsWith(VIDEO) == true
    } ?: error("aucune piste vidéo dans ${file.name}")
    private val format = extractor.getTrackFormat(track)
    private val rotation = if (format.containsKey(KEY_ROTATION)) format.getInteger(KEY_ROTATION) else 0
    private val codec: MediaCodec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
    private val info = MediaCodec.BufferInfo()
    private var inputEnded = false
    private var outputEnded = false
    private val buffers = VideoFrameBuffers()

    init {
        extractor.selectTrack(track)
        format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
        codec.configure(format, null, null, 0)
        codec.start()
    }

    override fun seekTo(sourceMillis: Long) {
        extractor.seekTo(sourceMillis * MICROS_PER_MILLI, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
        codec.flush()
        inputEnded = false
        outputEnded = false
    }

    override fun next(): DecodedVideoFrame? {
        if (outputEnded) return null
        val deadline = SystemClock.elapsedRealtime() + NEXT_BUDGET_MILLIS
        while (SystemClock.elapsedRealtime() < deadline) {
            feed()
            val index = codec.dequeueOutputBuffer(info, DEQUEUE_MICROS)
            if (index < 0) continue
            val ended = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            if (info.size <= 0) {
                codec.releaseOutputBuffer(index, false)
                if (ended) {
                    outputEnded = true
                    return null
                }
                continue
            }
            if (ended) outputEnded = true
            return Frame(index, info.presentationTimeUs / MICROS_PER_MILLI)
        }
        return null
    }

    override fun release() {
        runCatching { codec.stop() }
        codec.release()
        extractor.release()
        buffers.release()
    }

    private fun feed() {
        if (inputEnded) return
        val index = codec.dequeueInputBuffer(0)
        if (index < 0) return
        val buffer = codec.getInputBuffer(index) ?: return
        val size = extractor.readSampleData(buffer, 0)
        if (size < 0) {
            codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            inputEnded = true
            return
        }
        codec.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
        extractor.advance()
    }

    private inner class Frame(private val index: Int, override val presentationMillis: Long) : DecodedVideoFrame {
        private var released = false

        override fun render(): Bitmap? {
            val image = codec.getOutputImage(index) ?: return null
            return buffers.render(planesOf(image), rotation, maxLongSide)
        }

        override fun release() {
            if (released) return
            released = true
            codec.releaseOutputBuffer(index, false)
        }
    }

    private fun planesOf(image: Image): YuvPlanes {
        val crop = image.cropRect
        val (y, u, v) = image.planes
        val chromaLeft = crop.left / 2
        val chromaTop = crop.top / 2
        return YuvPlanes(
            width = crop.width(),
            height = crop.height(),
            y = buffers.plane(Y_PLANE, y.buffer, crop.top * y.rowStride + crop.left * y.pixelStride),
            yRowStride = y.rowStride,
            yPixelStride = y.pixelStride,
            u = buffers.plane(U_PLANE, u.buffer, chromaTop * u.rowStride + chromaLeft * u.pixelStride),
            uRowStride = u.rowStride,
            uPixelStride = u.pixelStride,
            v = buffers.plane(V_PLANE, v.buffer, chromaTop * v.rowStride + chromaLeft * v.pixelStride),
            vRowStride = v.rowStride,
            vPixelStride = v.pixelStride,
        )
    }

    private companion object {
        const val VIDEO = "video/"
        const val KEY_ROTATION = "rotation-degrees"
        const val MICROS_PER_MILLI = 1000L
        const val DEQUEUE_MICROS = 10_000L
        const val NEXT_BUDGET_MILLIS = 2_000L
        const val Y_PLANE = 0
        const val U_PLANE = 1
        const val V_PLANE = 2
    }
}
