package me.meeshy.sdk.media.scene

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import java.nio.ByteBuffer
import java.nio.ByteOrder
import me.meeshy.sdk.model.scene.export.StoryExportVolumePoint
import me.meeshy.sdk.model.scene.export.StoryExportVolumeCurve

/**
 * Le volume d'un morceau de son, échantillon par échantillon : le [gain] fixe de l'auteur, ou sa courbe ([envelope], en
 * millisecondes de la timeline commune) lue à l'heure de chaque image — le morceau rend sa première image à
 * [originMillis]. Un gain amplifié (jusqu'à 2) SATURE au lieu de déborder. Du PCM 16 bits.
 */
internal class EnvelopeGainAudioProcessor(
    private val gain: Float,
    private val envelope: List<StoryExportVolumePoint>,
    private val originMillis: Long,
) : BaseAudioProcessor() {

    private var sampleRate = 0
    private var channels = 0
    private var frames = 0L

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) {
            throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        }
        sampleRate = inputAudioFormat.sampleRate
        channels = inputAudioFormat.channelCount
        return inputAudioFormat
    }

    override fun onFlush() {
        frames = 0L
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val input = inputBuffer.order(ByteOrder.nativeOrder())
        val output = replaceOutputBuffer(input.remaining()).order(ByteOrder.nativeOrder())
        val width = maxOf(1, channels)
        var channel = 0
        var level = levelAt(frames)
        while (input.remaining() >= BYTES_PER_SAMPLE) {
            val scaled = Math.round(input.getShort() * level).coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
            output.putShort(scaled.toShort())
            channel += 1
            if (channel == width) {
                channel = 0
                frames += 1
                level = levelAt(frames)
            }
        }
        output.flip()
    }

    private fun levelAt(frame: Long): Float {
        if (envelope.isEmpty() || sampleRate <= 0) return gain
        return StoryExportVolumeCurve.gainAt(envelope, gain, originMillis + frame * MILLIS_PER_SECOND / sampleRate)
    }

    private companion object {
        const val BYTES_PER_SAMPLE = 2
        const val MILLIS_PER_SECOND = 1000L
    }
}
