package me.meeshy.sdk.call.capture

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
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.CaptureGallery

internal enum class CallMontageTrack { VIDEO, AUDIO }

/** Où un encodeur pose ce qu'il produit : son format d'abord, puis chaque échantillon. */
internal interface CallMontageEncodedSink {
    fun format(track: CallMontageTrack, format: Any)
    fun sample(track: CallMontageTrack, data: ByteArray, ptsUs: Long, flags: Int)
}

/** L'encodeur d'images (H.264 sur surface d'entrée en production). */
internal interface CallMontageVideoEncoder {
    fun open(width: Int, height: Int): Boolean
    fun draw(frame: Bitmap)
    fun drain(sink: CallMontageEncodedSink)
    fun finish(sink: CallMontageEncodedSink)
    fun release()
}

/** L'encodeur du son (AAC LC en production). */
internal interface CallMontageAudioEncoder {
    fun open(format: CallMontageAudioFormat): Boolean
    fun encode(pcm: ByteArray, ptsUs: Long)
    fun drain(sink: CallMontageEncodedSink)
    fun finish(sink: CallMontageEncodedSink)
    fun release()
}

/** Le conteneur du fichier (`MediaMuxer` en production). */
internal interface CallMontageContainer {
    fun addTrack(format: Any): Int
    fun start()
    fun write(track: Int, data: ByteArray, ptsUs: Long, flags: Int)
    fun stop()
    fun release()
}

/** Ce que le film devient une fois fini : déposé en galerie, ou perdu (l'avis `failed`). */
public enum class CallMontageFilmOutcome { SAVED, FAILED }

/**
 * **FILMER LE MONTAGE** (iOS `CallMontageRecorder`) : chaque image rendue part dans un encodeur H.264, le son d'un
 * [CallMontageAudioSource] INDÉPENDANT de WebRTC dans un encodeur AAC, tous deux datés sur la même [clock] hôte,
 * puis réunis par un `MediaMuxer` dans un MP4 provisoire. Un MP4 ne s'ouvre qu'une fois les deux formats connus ;
 * une voix qui tarde plus d'une seconde laisse le film partir muet. Le son d'avant la première image ou qui
 * reculerait est écarté. Un échec supprime le temporaire. Une instance ne sert qu'un film.
 */
public class CallMontageRecorder internal constructor(
    private val videoEncoder: CallMontageVideoEncoder,
    private val audioEncoder: CallMontageAudioEncoder,
    private val audioSource: CallMontageAudioSource?,
    private val containers: (File) -> CallMontageContainer,
    private val directory: File,
    private val clock: CallMontageClock,
    private val dispatcher: CoroutineDispatcher,
) {
    public constructor(directory: File, audio: CallMontageAudioSource?, clock: CallMontageClock = CallMontageClock()) : this(
        videoEncoder = MediaCodecVideoEncoder(),
        audioEncoder = MediaCodecAudioEncoder(),
        audioSource = audio,
        containers = { MediaMuxerContainer(it) },
        directory = directory,
        clock = clock,
        dispatcher = Executors.newSingleThreadExecutor { Thread(it, "call-montage-recorder").apply { isDaemon = true } }.asCoroutineDispatcher(),
    )

    /** L'instant de départ du film, publié pour l'anneau de progression ; `null` hors film. */
    public val startedAtMillis: StateFlow<Long?> get() = clock.startedAtMillis

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private var file: File? = null
    private var writer: TrackWriter? = null
    private var listening = false

    public suspend fun start(width: Int, height: Int): Boolean = withContext(dispatcher) {
        release(deleteFile = true)
        val output = File(directory, "meeshy-montage-${UUID.randomUUID()}.mp4")
        val opened = runCatching { videoEncoder.open(width, height) }.getOrDefault(false)
        if (!opened) return@withContext false.also { release(deleteFile = true) }
        val voiced = openVoice()
        val container = runCatching { containers(output) }.getOrNull()
        if (container == null) return@withContext false.also { release(deleteFile = true) }
        file = output
        writer = TrackWriter(container, expectsAudio = voiced, clock = clock)
        clock.markStart()
        true
    }

    private fun openVoice(): Boolean {
        val source = audioSource ?: return false
        val format = source.format ?: return false
        if (!runCatching { audioEncoder.open(format) }.getOrDefault(false)) return false
        listening = runCatching { source.start(::hear) }.getOrDefault(false)
        if (!listening) audioEncoder.release()
        return listening
    }

    private fun hear(chunk: CallMontageAudioChunk) {
        scope.launch {
            if (writer == null) return@launch
            runCatching {
                audioEncoder.encode(chunk.pcm, chunk.startUs)
                audioEncoder.drain(sink())
            }
        }
    }

    public suspend fun append(frame: Bitmap): Unit = withContext(dispatcher) {
        if (writer == null) return@withContext
        runCatching {
            videoEncoder.draw(frame)
            videoEncoder.drain(sink())
        }
        Unit
    }

    /** Ferme le film : le fichier valide, ou `null` (temporaire supprimé) s'il n'a aucune image ou si l'écriture a échoué. */
    public suspend fun finish(): File? = withContext(dispatcher) {
        stopListening()
        val current = writer ?: return@withContext null
        val output = file
        val written = runCatching {
            if (listening) audioEncoder.finish(sink())
            videoEncoder.finish(sink())
            current.flush()
            current.videoSamples > 0
        }.getOrDefault(false)
        release(deleteFile = !written)
        output.takeIf { written }
    }

    public suspend fun cancel(): Unit = withContext(dispatcher) { release(deleteFile = true) }

    /**
     * Ferme le film et le dépose dans la galerie ([gallery], MediaStore en production) ; le temporaire est
     * supprimé dans tous les cas.
     */
    public suspend fun finishInto(gallery: CaptureGallery, displayName: String): CallMontageFilmOutcome {
        val film = finish() ?: return CallMontageFilmOutcome.FAILED
        val saved = try {
            gallery.saveVideo(film, displayName)
        } finally {
            film.delete()
        }
        return if (saved) CallMontageFilmOutcome.SAVED else CallMontageFilmOutcome.FAILED
    }

    private fun sink() = object : CallMontageEncodedSink {
        override fun format(track: CallMontageTrack, format: Any) {
            writer?.format(track, format, clock.nowUs())
        }

        override fun sample(track: CallMontageTrack, data: ByteArray, ptsUs: Long, flags: Int) {
            writer?.sample(track, data, ptsUs, flags, clock.nowUs())
        }
    }

    private fun stopListening() {
        if (!listening) return
        runCatching { audioSource?.stop() }
    }

    private fun release(deleteFile: Boolean) {
        stopListening()
        listening = false
        runCatching { videoEncoder.release() }
        runCatching { audioEncoder.release() }
        writer?.close()
        if (deleteFile) file?.delete()
        writer = null
        file = null
        clock.markEnd()
    }

    /** Range les échantillons dans le conteneur, une fois les formats connus. */
    internal class TrackWriter(
        private val container: CallMontageContainer,
        private val expectsAudio: Boolean,
        private val clock: CallMontageClock,
        private val audioWaitUs: Long = AUDIO_WAIT_US,
    ) {
        private class Pending(val track: CallMontageTrack, val data: ByteArray, val ptsUs: Long, val flags: Int)

        private val formats = HashMap<CallMontageTrack, Any>()
        private val tracks = HashMap<CallMontageTrack, Int>()
        private val pending = ArrayList<Pending>()
        private var started = false
        private var videoFormatAtUs = 0L
        private var firstVideoUs: Long? = null
        private var lastAudioUs = Long.MIN_VALUE

        var videoSamples = 0
            private set

        fun format(track: CallMontageTrack, format: Any, nowUs: Long) {
            if (started || formats.containsKey(track)) return
            formats[track] = format
            if (track == CallMontageTrack.VIDEO) videoFormatAtUs = nowUs
            startIfReady(nowUs)
        }

        fun sample(track: CallMontageTrack, data: ByteArray, ptsUs: Long, flags: Int, nowUs: Long) {
            if (track == CallMontageTrack.VIDEO && firstVideoUs == null) firstVideoUs = ptsUs
            val sample = Pending(track, data, ptsUs, flags)
            if (started) write(sample) else if (pending.size < MAX_PENDING) pending += sample
            startIfReady(nowUs)
        }

        fun flush() {
            if (!started && formats.containsKey(CallMontageTrack.VIDEO) && firstVideoUs != null) open()
        }

        fun close() {
            if (started && videoSamples > 0) runCatching { container.stop() }
            runCatching { container.release() }
        }

        private fun startIfReady(nowUs: Long) {
            if (started || !formats.containsKey(CallMontageTrack.VIDEO) || firstVideoUs == null) return
            val voiceReady = !expectsAudio || formats.containsKey(CallMontageTrack.AUDIO)
            if (voiceReady || nowUs - videoFormatAtUs >= audioWaitUs) open()
        }

        private fun open() {
            tracks[CallMontageTrack.VIDEO] = container.addTrack(checkNotNull(formats[CallMontageTrack.VIDEO]))
            formats[CallMontageTrack.AUDIO]?.takeIf { expectsAudio }?.let { tracks[CallMontageTrack.AUDIO] = container.addTrack(it) }
            container.start()
            started = true
            pending.forEach(::write)
            pending.clear()
        }

        private fun write(sample: Pending) {
            val index = tracks[sample.track] ?: return
            if (sample.track == CallMontageTrack.AUDIO) {
                val first = firstVideoUs ?: return
                if (sample.ptsUs < first || sample.ptsUs <= lastAudioUs) return
                lastAudioUs = sample.ptsUs
            } else {
                videoSamples += 1
            }
            container.write(index, sample.data, sample.ptsUs, sample.flags)
        }

        companion object {
            const val AUDIO_WAIT_US = 1_000_000L
            private const val MAX_PENDING = 512
        }
    }
}

private const val BIT_RATE = 4_000_000
private const val FRAME_RATE = 15
private const val DRAIN_TIMEOUT_US = 10_000L
private const val MAX_SEAL_WAITS = 200
private const val VOICE_BIT_RATE = 96_000
private const val VOICE_MAX_INPUT_BYTES = 16_384
private const val INPUT_TIMEOUT_US = 5_000L
private const val BYTES_PER_SAMPLE = 2
private const val MICROS_PER_SECOND = 1_000_000L

private fun drainCodec(codec: MediaCodec, endOfStream: Boolean, onFormat: (MediaFormat) -> Unit, onSample: (ByteArray, MediaCodec.BufferInfo) -> Unit) {
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
                    onSample(ByteArray(info.size).also(buffer::get), info)
                }
                codec.releaseOutputBuffer(index, false)
                if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
            }
        }
    }
}

private class MediaCodecVideoEncoder : CallMontageVideoEncoder {
    private var codec: MediaCodec? = null
    private var surface: Surface? = null
    private var bounds = Rect()
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)

    override fun open(width: Int, height: Int): Boolean {
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
            setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
        }
        val created = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        codec = created
        created.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        surface = created.createInputSurface()
        created.start()
        bounds = Rect(0, 0, width, height)
        return true
    }

    override fun draw(frame: Bitmap) {
        val target = surface ?: return
        val canvas = target.lockHardwareCanvas()
        try {
            canvas.drawColor(Color.BLACK)
            canvas.drawBitmap(frame, null, bounds, paint)
        } finally {
            target.unlockCanvasAndPost(canvas)
        }
    }

    override fun drain(sink: CallMontageEncodedSink) = drain(sink, endOfStream = false)

    override fun finish(sink: CallMontageEncodedSink) {
        codec?.signalEndOfInputStream()
        drain(sink, endOfStream = true)
    }

    private fun drain(sink: CallMontageEncodedSink, endOfStream: Boolean) {
        val current = codec ?: return
        drainCodec(current, endOfStream, { sink.format(CallMontageTrack.VIDEO, it) }) { data, info ->
            sink.sample(CallMontageTrack.VIDEO, data, info.presentationTimeUs, info.flags)
        }
    }

    override fun release() {
        runCatching { codec?.stop() }
        runCatching { codec?.release() }
        runCatching { surface?.release() }
        codec = null
        surface = null
    }
}

private class MediaCodecAudioEncoder : CallMontageAudioEncoder {
    private var codec: MediaCodec? = null
    private var format = CallMontageAudioFormat(sampleRate = 44_100, channels = 1)

    override fun open(format: CallMontageAudioFormat): Boolean {
        this.format = format
        val media = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, format.sampleRate, format.channels.coerceIn(1, 2)).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, VOICE_BIT_RATE)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, VOICE_MAX_INPUT_BYTES)
        }
        val created = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        codec = created
        created.configure(media, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        created.start()
        return true
    }

    override fun encode(pcm: ByteArray, ptsUs: Long) {
        val current = codec ?: return
        var offset = 0
        while (offset < pcm.size) {
            val index = current.dequeueInputBuffer(INPUT_TIMEOUT_US)
            if (index < 0) return
            val input = current.getInputBuffer(index) ?: return
            input.clear()
            val length = minOf(input.remaining(), pcm.size - offset)
            input.put(pcm, offset, length)
            val chunkUs = ptsUs + offset.toLong() / (BYTES_PER_SAMPLE * format.channels) * MICROS_PER_SECOND / format.sampleRate
            current.queueInputBuffer(index, 0, length, chunkUs, 0)
            offset += length
        }
    }

    override fun drain(sink: CallMontageEncodedSink) = drain(sink, endOfStream = false)

    override fun finish(sink: CallMontageEncodedSink) {
        val current = codec ?: return
        val index = current.dequeueInputBuffer(DRAIN_TIMEOUT_US)
        if (index >= 0) current.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
        drain(sink, endOfStream = index >= 0)
    }

    private fun drain(sink: CallMontageEncodedSink, endOfStream: Boolean) {
        val current = codec ?: return
        drainCodec(current, endOfStream, { sink.format(CallMontageTrack.AUDIO, it) }) { data, info ->
            sink.sample(CallMontageTrack.AUDIO, data, info.presentationTimeUs, info.flags)
        }
    }

    override fun release() {
        runCatching { codec?.stop() }
        runCatching { codec?.release() }
        codec = null
    }
}

private class MediaMuxerContainer(file: File) : CallMontageContainer {
    private val muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

    override fun addTrack(format: Any): Int = muxer.addTrack(format as MediaFormat)

    override fun start() = muxer.start()

    override fun write(track: Int, data: ByteArray, ptsUs: Long, flags: Int) {
        val info = MediaCodec.BufferInfo().apply { set(0, data.size, ptsUs, flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) }
        muxer.writeSampleData(track, ByteBuffer.wrap(data), info)
    }

    override fun stop() = muxer.stop()

    override fun release() = muxer.release()
}
