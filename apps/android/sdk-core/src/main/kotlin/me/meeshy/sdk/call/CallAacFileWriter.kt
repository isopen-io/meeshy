package me.meeshy.sdk.call

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteOrder

/** Écrit du PCM 16 bits mono dans un fichier M4A (AAC-LC). La couture de l'encodeur : remplaçable en test. */
internal interface CallAacFileWriter {
    fun open(file: File, sampleRate: Int): Boolean

    fun write(pcm: ShortArray)

    /** Finalise le fichier ; `true` si au moins un échantillon est écrit. */
    fun close(): Boolean
}

/** `MediaCodec` (AAC) + `MediaMuxer` (MPEG-4) : l'encodeur du matériel, l'horloge est le nombre d'échantillons. */
internal class MediaCodecAacFileWriter : CallAacFileWriter {
    private var codec: MediaCodec? = null
    private var muxer: MediaMuxer? = null
    private var track = -1
    private var muxing = false
    private var sampleRate = 0
    private var samples = 0L
    private val info = MediaCodec.BufferInfo()

    override fun open(file: File, sampleRate: Int): Boolean = try {
        val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, 1).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, MAX_INPUT_BYTES)
        }
        val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        encoder.start()
        codec = encoder
        muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        this.sampleRate = sampleRate
        true
    } catch (failure: Exception) {
        release()
        false
    }

    override fun write(pcm: ShortArray) {
        val encoder = codec ?: return
        var offset = 0
        while (offset < pcm.size) {
            val index = nextInput(encoder)
            if (index < 0) return
            val input = encoder.getInputBuffer(index) ?: return
            input.clear()
            input.order(ByteOrder.LITTLE_ENDIAN)
            val count = minOf(pcm.size - offset, input.capacity() / BYTES)
            for (i in 0 until count) input.putShort(pcm[offset + i])
            encoder.queueInputBuffer(index, 0, count * BYTES, samples * MICROS / sampleRate, 0)
            samples += count
            offset += count
            drain(endOfStream = false)
        }
    }

    override fun close(): Boolean {
        val encoder = codec ?: return false
        val hadSamples = samples > 0
        val finished = try {
            val index = nextInput(encoder)
            if (index >= 0) {
                encoder.queueInputBuffer(index, 0, 0, samples * MICROS / maxOf(sampleRate, 1), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            }
            drain(endOfStream = index >= 0)
            if (muxing) muxer?.stop()
            muxing
        } catch (failure: Exception) {
            false
        }
        release()
        return hadSamples && finished
    }

    private fun nextInput(encoder: MediaCodec): Int {
        repeat(INPUT_ATTEMPTS) {
            val index = encoder.dequeueInputBuffer(TIMEOUT_US)
            if (index >= 0) return index
            drain(endOfStream = false)
        }
        return -1
    }

    private fun drain(endOfStream: Boolean) {
        val encoder = codec ?: return
        var idle = 0
        while (true) {
            val index = encoder.dequeueOutputBuffer(info, if (endOfStream) TIMEOUT_US else 0L)
            when {
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    track = muxer?.addTrack(encoder.outputFormat) ?: -1
                    muxer?.start()
                    muxing = true
                }
                index == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (!endOfStream || ++idle > DRAIN_PATIENCE) return
                }
                index >= 0 -> {
                    val output = encoder.getOutputBuffer(index)
                    val config = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                    if (output != null && info.size > 0 && !config && muxing) {
                        output.position(info.offset)
                        output.limit(info.offset + info.size)
                        muxer?.writeSampleData(track, output, info)
                    }
                    encoder.releaseOutputBuffer(index, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                }
            }
        }
    }

    private fun release() {
        runCatching { codec?.stop() }
        runCatching { codec?.release() }
        runCatching { muxer?.release() }
        codec = null
        muxer = null
        muxing = false
    }

    private companion object {
        const val BIT_RATE = 64_000
        const val MAX_INPUT_BYTES = 16_384
        const val BYTES = 2
        const val MICROS = 1_000_000L
        const val TIMEOUT_US = 10_000L
        const val INPUT_ATTEMPTS = 20
        const val DRAIN_PATIENCE = 50
    }
}
