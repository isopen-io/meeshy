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
import java.nio.ByteBuffer
import java.util.UUID
import java.util.concurrent.Executors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.call.CallPcmFrame
import timber.log.Timber

/**
 * **FILMER LE MONTAGE** — miroir de `CallMontageRecorder` (iOS, #8625) : chaque image RENDUE du montage (la
 * même peinture que la photo) se pose sur la surface d'entrée d'un encodeur H.264 matériel, puis le flux
 * se range dans un MP4 provisoire du cache, prêt à partir en galerie. Tout se fait sur un fil dédié,
 * rendu au système une fois le film fini ou abandonné : une instance ne sert qu'un film.
 *
 * LA VOIX LOCALE (#13692, iOS `CallMontageMicrophoneTap`) : WebRTC tient le micro, alors le film écoute les
 * tampons que l'appel enregistre déjà ([microphone], `CallMicrophoneSamples`) — sans second enregistrement
 * qui couperait l'appel ou n'entendrait que du silence — et les encode en AAC à côté de l'image, datés sur la
 * même horloge monotone que la surface donne aux images ([CallMontageAudioTimeline]). Une voix qui ne vient
 * pas laisse le film muet ([CallMontageMux]). LIMITE ASSUMÉE, la même qu'iOS : les voix DISTANTES n'y sont pas.
 */
class CallCaptureRecorder(
    private val directory: File,
    private val microphone: Flow<CallPcmFrame>? = null,
    private val nowUs: () -> Long = { System.nanoTime() / NANOS_PER_MICRO },
) : CallCaptureRecording {
    private val thread = Executors.newSingleThreadExecutor { Thread(it, "call-capture-recorder") }.asCoroutineDispatcher()
    private val listening = CoroutineScope(SupervisorJob() + thread)
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)

    private var encoder: MediaCodec? = null
    private var surface: Surface? = null
    private var muxer: MediaMuxer? = null
    private var mux: CallMontageMux<MediaFormat>? = null
    private var file: File? = null
    private var size = Rect()

    private var voice: MediaCodec? = null
    private var voiceTimeline = CallMontageAudioTimeline()
    private var voiceListener: Job? = null

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
            val container = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            muxer = container
            mux = CallMontageMux(MediaMuxerSink(container), expectsAudio = microphone != null)
            file = output
            size = Rect(0, 0, width, height)
            listen()
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

    override suspend fun finish(): File? {
        voiceListener?.cancelAndJoin()
        return withContext(thread) { seal() }.also { close() }
    }

    override suspend fun cancel() {
        voiceListener?.cancelAndJoin()
        withContext(thread) { release(deleteFile = true) }
        close()
    }

    private fun close() {
        listening.cancel()
        thread.close()
    }

    private fun listen() {
        val frames = microphone ?: return
        voiceListener = listening.launch {
            frames.collect { frame ->
                runCatching { hear(frame) }.onFailure { failure ->
                    Timber.w(failure, "call-capture: voice dropped")
                    dropVoice()
                }
            }
        }
    }

    private fun hear(frame: CallPcmFrame) {
        if (encoder == null) return
        val ptsUs = voiceTimeline.stamp(frame.pcm.size, frame.sampleRate, frame.channelCount, nowUs()) ?: return
        val codec = voice ?: openVoice(frame.sampleRate, frame.channelCount)
        var offset = 0
        while (offset < frame.pcm.size) {
            val index = codec.dequeueInputBuffer(VOICE_INPUT_TIMEOUT_US)
            if (index < 0) break
            val input = codec.getInputBuffer(index) ?: break
            input.clear()
            val length = minOf(input.remaining(), frame.pcm.size - offset)
            input.put(frame.pcm, offset, length)
            val chunkUs = ptsUs + offset.toLong() / (BYTES_PER_SAMPLE * frame.channelCount) * MICROS_PER_SECOND / frame.sampleRate
            codec.queueInputBuffer(index, 0, length, chunkUs, 0)
            offset += length
        }
        drainVoice(endOfStream = false)
    }

    private fun openVoice(sampleRate: Int, channelCount: Int): MediaCodec {
        val channels = channelCount.coerceIn(1, 2)
        val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, channels).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, VOICE_BIT_RATE)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, VOICE_MAX_INPUT_BYTES)
        }
        val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        voice = codec
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        codec.start()
        return codec
    }

    private fun dropVoice() {
        runCatching { voice?.stop() }
        runCatching { voice?.release() }
        voice = null
    }

    private fun seal(): File? {
        val codec = encoder ?: return null
        val written = runCatching {
            sealVoice()
            codec.signalEndOfInputStream()
            drain(endOfStream = true)
            mux?.flush()
            (mux?.videoSamples ?: 0) > 0
        }.getOrDefault(false)
        val output = file
        release(deleteFile = !written)
        return output.takeIf { written }
    }

    private fun sealVoice() {
        val codec = voice ?: return
        runCatching {
            val index = codec.dequeueInputBuffer(DRAIN_TIMEOUT_US)
            if (index >= 0) codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            drainVoice(endOfStream = index >= 0)
        }.onFailure { Timber.w(it, "call-capture: voice not sealed") }
    }

    private fun drain(endOfStream: Boolean) {
        val codec = encoder ?: return
        drainCodec(codec, endOfStream, onFormat = { mux?.videoFormat(it, nowUs()) }) { data, info ->
            mux?.video(data, info.presentationTimeUs, info.flags, nowUs())
        }
    }

    private fun drainVoice(endOfStream: Boolean) {
        val codec = voice ?: return
        drainCodec(codec, endOfStream, onFormat = { mux?.audioFormat(it, nowUs()) }) { data, info ->
            mux?.audio(data, info.presentationTimeUs, info.flags, nowUs())
        }
    }

    private inline fun drainCodec(
        codec: MediaCodec,
        endOfStream: Boolean,
        onFormat: (MediaFormat) -> Unit,
        onSample: (ByteArray, MediaCodec.BufferInfo) -> Unit,
    ) {
        val info = MediaCodec.BufferInfo()
        var waits = 0
        while (true) {
            val index = codec.dequeueOutputBuffer(info, if (endOfStream) DRAIN_TIMEOUT_US else 0L)
            when {
                index == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!endOfStream || ++waits > MAX_SEAL_WAITS) return
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> onFormat(codec.outputFormat)
                index >= 0 -> {
                    val buffer = codec.getOutputBuffer(index)
                    val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                    if (buffer != null && info.size > 0 && !isConfig) {
                        buffer.position(info.offset)
                        buffer.limit(info.offset + info.size)
                        val data = ByteArray(info.size)
                        buffer.get(data)
                        onSample(data, info)
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
        dropVoice()
        if (mux?.videoSamples?.let { it > 0 } == true) runCatching { muxer?.stop() }
        runCatching { muxer?.release() }
        if (deleteFile) file?.delete()
        encoder = null
        surface = null
        muxer = null
        mux = null
        file = null
        voiceTimeline = CallMontageAudioTimeline()
    }

    private class MediaMuxerSink(private val muxer: MediaMuxer) : CallMontageMuxerSink<MediaFormat> {
        override fun addTrack(format: MediaFormat): Int = muxer.addTrack(format)

        override fun start() = muxer.start()

        override fun write(track: Int, data: ByteArray, ptsUs: Long, flags: Int) {
            val info = MediaCodec.BufferInfo().apply { set(0, data.size, ptsUs, flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) }
            muxer.writeSampleData(track, ByteBuffer.wrap(data), info)
        }
    }

    private companion object {
        const val BIT_RATE = 4_000_000
        const val FRAME_RATE = 15
        const val DRAIN_TIMEOUT_US = 10_000L
        const val MAX_SEAL_WAITS = 200
        const val VOICE_BIT_RATE = 96_000
        const val VOICE_MAX_INPUT_BYTES = 16_384
        const val VOICE_INPUT_TIMEOUT_US = 5_000L
        const val BYTES_PER_SAMPLE = 2
        const val MICROS_PER_SECOND = 1_000_000L
        const val NANOS_PER_MICRO = 1_000L
    }
}
