package me.meeshy.sdk.call

import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.projection.MediaProjection
import android.view.Surface
import me.meeshy.sdk.model.call.CallRecordingVideoSize
import java.io.File
import java.nio.ByteBuffer

/** Ce que la vidéo capte : la projection DÉJÀ obtenue (le service de premier plan la tient) et la taille des images. */
public class CallScreenFrame(
    public val projection: MediaProjection,
    public val width: Int,
    public val height: Int,
    public val densityDpi: Int,
)

/**
 * L'enregistrement VIDÉO d'un appel (#14553) : l'écran de Meeshy par une [MediaProjection] vers un encodeur H.264
 * (surface d'entrée), la voix (micro + autres, déjà mélangées par [CallAudioRecorder]) dans une piste AAC, puis
 * un seul MP4 — iOS fait de même (fichier brut, une piste par source, mixage final). La taille suit les IMAGES
 * captées ([CallRecordingVideoSize]), jamais l'écran physique. Ce recorder ne touche pas à la projection :
 * son propriétaire (le service de premier plan) l'arrête.
 */
internal class CallScreenRecorder(
    private val audio: CallAudioRecorder,
    private val frame: () -> CallScreenFrame?,
) {
    private var screen: ScreenEncoder? = null
    private var target: File? = null

    fun start(file: File): Boolean {
        val captured = frame() ?: return false
        val size = CallRecordingVideoSize.fit(captured.width, captured.height) ?: return false
        val encoder = ScreenEncoder(File(file.parentFile, file.name + RAW_SUFFIX))
        if (!encoder.start(captured.projection, size, captured.densityDpi)) return false
        if (!audio.start(File(file.parentFile, file.name + AUDIO_SUFFIX))) {
            encoder.stop()
            return false
        }
        screen = encoder
        target = file
        return true
    }

    /** Termine les deux pistes et les réunit ; l'audio seul n'est pas rendu à la place d'une vidéo manquée. */
    fun stop(): File? {
        val encoder = screen ?: return null
        val file = target ?: return null
        screen = null
        target = null
        val audioFile = audio.stop()
        val videoFile = encoder.stop()
        val merged = videoFile != null && join(videoFile, audioFile, file)
        videoFile?.delete()
        audioFile?.delete()
        if (!merged) file.delete()
        return file.takeIf { merged }
    }

    private fun join(video: File, audio: File?, output: File): Boolean = try {
        val muxer = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        try {
            val sources = listOfNotNull(video, audio).map { Source(it) }
            val tracks = sources.map { source -> muxer.addTrack(source.format) }
            muxer.start()
            sources.forEachIndexed { index, source -> source.copyTo(muxer, tracks[index]) }
            muxer.stop()
            true
        } finally {
            muxer.release()
        }
    } catch (failure: Exception) {
        false
    }

    private class Source(file: File) {
        private val extractor = MediaExtractor().apply { setDataSource(file.absolutePath) }
        val format: MediaFormat = extractor.getTrackFormat(0).also { extractor.selectTrack(0) }

        fun copyTo(muxer: MediaMuxer, track: Int) {
            val buffer = ByteBuffer.allocate(COPY_BUFFER_BYTES)
            val info = MediaCodec.BufferInfo()
            var origin = -1L
            while (true) {
                buffer.clear()
                val size = extractor.readSampleData(buffer, 0)
                if (size < 0) break
                // L'encodeur vidéo date ses images sur l'horloge système : chaque piste repart de zéro.
                if (origin < 0) origin = extractor.sampleTime
                info.set(0, size, extractor.sampleTime - origin, extractor.sampleFlags)
                muxer.writeSampleData(track, buffer, info)
                extractor.advance()
            }
            extractor.release()
        }
    }

    /** L'encodeur H.264 et son écran virtuel ; son fil vide les sorties vers un MP4 sans son. */
    private class ScreenEncoder(private val raw: File) {
        private var codec: MediaCodec? = null
        private var muxer: MediaMuxer? = null
        private var display: VirtualDisplay? = null
        private var surface: Surface? = null
        private var drain: Thread? = null

        @Volatile
        private var wrote = false

        fun start(projection: MediaProjection, size: CallRecordingVideoSize, dpi: Int): Boolean = try {
            val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, size.width, size.height).apply {
                setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
                setInteger(MediaFormat.KEY_BIT_RATE, VIDEO_BIT_RATE)
                setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
                setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, KEY_FRAME_SECONDS)
            }
            val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
            encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            val input = encoder.createInputSurface()
            encoder.start()
            codec = encoder
            surface = input
            muxer = MediaMuxer(raw.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            display = projection.createVirtualDisplay(
                DISPLAY_NAME, size.width, size.height, dpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, input, null, null,
            )
            drain = Thread({ pump(encoder) }, "call-recording-video").also { it.start() }
            true
        } catch (failure: Exception) {
            release()
            false
        }

        fun stop(): File? {
            runCatching { display?.release() }
            runCatching { codec?.signalEndOfInputStream() }
            drain?.join(DRAIN_JOIN_MS)
            release()
            return raw.takeIf { wrote }.also { if (!wrote) raw.delete() }
        }

        private fun pump(encoder: MediaCodec) {
            val info = MediaCodec.BufferInfo()
            var track = -1
            try {
                while (true) {
                    val index = encoder.dequeueOutputBuffer(info, TIMEOUT_US)
                    when {
                        index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                            track = muxer?.addTrack(encoder.outputFormat) ?: -1
                            muxer?.start()
                        }
                        index >= 0 -> {
                            val output = encoder.getOutputBuffer(index)
                            val config = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                            if (output != null && info.size > 0 && !config && track >= 0) {
                                output.position(info.offset)
                                output.limit(info.offset + info.size)
                                muxer?.writeSampleData(track, output, info)
                                wrote = true
                            }
                            encoder.releaseOutputBuffer(index, false)
                            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                        }
                    }
                }
            } catch (failure: Exception) {
                wrote = false
            }
        }

        private fun release() {
            runCatching { muxer?.stop() }
            runCatching { muxer?.release() }
            runCatching { codec?.stop() }
            runCatching { codec?.release() }
            runCatching { surface?.release() }
            muxer = null
            codec = null
            surface = null
            display = null
        }

        private companion object {
            const val DISPLAY_NAME = "MeeshyCallRecording"
            const val VIDEO_BIT_RATE = 2_500_000
            const val FRAME_RATE = 30
            const val KEY_FRAME_SECONDS = 2
            const val TIMEOUT_US = 10_000L
            const val DRAIN_JOIN_MS = 3_000L
        }
    }

    private companion object {
        const val RAW_SUFFIX = ".video"
        const val AUDIO_SUFFIX = ".audio"
        const val COPY_BUFFER_BYTES = 1 shl 20
    }
}
