package me.meeshy.app.calls

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.view.Surface
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.withContext
import timber.log.Timber

/**
 * **FILMER LE MONTAGE** — miroir de `CallMontageRecorder` (iOS, #8625) : chaque image RENDUE du montage (la
 * même peinture que la photo) se pose sur la surface d'entrée d'un encodeur H.264 matériel, puis le flux
 * se range dans un MP4 provisoire du cache, prêt à partir en galerie. Tout se fait sur un fil dédié,
 * rendu au système une fois le film fini ou abandonné : une instance ne sert qu'un film.
 *
 * LIMITE ASSUMÉE — la vidéo est muette : WebRTC tient le micro pendant l'appel (#13692). iOS y pose la voix
 * locale.
 */
class CallCaptureRecorder(private val directory: File) : CallCaptureRecording {
    private val thread = Executors.newSingleThreadExecutor { Thread(it, "call-capture-recorder") }.asCoroutineDispatcher()
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)

    private var encoder: MediaCodec? = null
    private var surface: Surface? = null
    private var muxer: MediaMuxer? = null
    private var file: File? = null
    private var track = -1
    private var samples = 0
    private var size = Rect()

    override suspend fun start(width: Int, height: Int): Boolean = withContext(thread) {
        release(deleteFile = true)
        runCatching {
            val output = File(directory, "meeshy-montage-${UUID.randomUUID()}.mp4")
            val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
                setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
                setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
                setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
                setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
            }
            val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
            encoder = codec
            codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            surface = codec.createInputSurface()
            codec.start()
            muxer = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            file = output
            size = Rect(0, 0, width, height)
            true
        }.getOrElse { failure ->
            Timber.w(failure, "call-capture: recorder refused to start")
            release(deleteFile = true)
            false
        }
    }

    override suspend fun append(frame: Bitmap) = withContext(thread) {
        val target = surface ?: return@withContext
        runCatching {
            val canvas = target.lockHardwareCanvas()
            try {
                canvas.drawColor(Color.BLACK)
                canvas.drawBitmap(frame, null, size, paint)
            } finally {
                target.unlockCanvasAndPost(canvas)
            }
            drain(endOfStream = false)
        }.onFailure { Timber.w(it, "call-capture: frame not encoded") }
        Unit
    }

    override suspend fun finish(): File? = withContext(thread) { seal() }.also { thread.close() }

    override suspend fun cancel() {
        withContext(thread) { release(deleteFile = true) }
        thread.close()
    }

    private fun seal(): File? {
        val codec = encoder ?: return null
        val written = runCatching {
            codec.signalEndOfInputStream()
            drain(endOfStream = true)
            samples > 0
        }.getOrDefault(false)
        val output = file
        release(deleteFile = !written)
        return output.takeIf { written }
    }

    private fun drain(endOfStream: Boolean) {
        val codec = encoder ?: return
        val info = MediaCodec.BufferInfo()
        while (true) {
            val index = codec.dequeueOutputBuffer(info, if (endOfStream) DRAIN_TIMEOUT_US else 0L)
            when {
                index == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!endOfStream) return
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> muxer?.let { mux ->
                    track = mux.addTrack(codec.outputFormat)
                    mux.start()
                }
                index >= 0 -> {
                    val buffer = codec.getOutputBuffer(index)
                    val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                    if (buffer != null && info.size > 0 && !isConfig && track >= 0) {
                        buffer.position(info.offset)
                        buffer.limit(info.offset + info.size)
                        muxer?.writeSampleData(track, buffer, info)
                        samples += 1
                    }
                    codec.releaseOutputBuffer(index, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                }
            }
        }
    }

    private fun release(deleteFile: Boolean) {
        runCatching { encoder?.stop() }
        runCatching { encoder?.release() }
        runCatching { surface?.release() }
        if (track >= 0) runCatching { muxer?.stop() }
        runCatching { muxer?.release() }
        if (deleteFile) file?.delete()
        encoder = null
        surface = null
        muxer = null
        file = null
        track = -1
        samples = 0
    }

    private companion object {
        const val BIT_RATE = 4_000_000
        const val FRAME_RATE = 15
        const val DRAIN_TIMEOUT_US = 10_000L
    }
}
