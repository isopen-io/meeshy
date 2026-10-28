package me.meeshy.sdk.media.scene

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import java.nio.ByteBuffer

/**
 * Pose [leadMillis] de silence AVANT le premier échantillon : un son qui entre à t = 2 s dans la scène s'écrit dans sa
 * propre séquence sans que Media3 1.4 sache décaler un élément. Du PCM 16 bits ; le silence n'est écrit qu'une fois.
 */
internal class LeadingSilenceAudioProcessor(private val leadMillis: Long) : BaseAudioProcessor() {

    private var leadBytes = 0
    private var pending = 0

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) {
            throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        }
        leadBytes = frames(inputAudioFormat.sampleRate) * inputAudioFormat.channelCount * BYTES_PER_SAMPLE
        pending = leadBytes
        return inputAudioFormat
    }

    override fun onFlush() {
        pending = leadBytes
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val silence = pending
        pending = 0
        val output = replaceOutputBuffer(silence + inputBuffer.remaining())
        repeat(silence) { output.put(0) }
        output.put(inputBuffer)
        output.flip()
    }

    private fun frames(sampleRate: Int): Int = (leadMillis.coerceAtLeast(0L) * sampleRate / MILLIS_PER_SECOND).toInt()

    private companion object {
        const val BYTES_PER_SAMPLE = 2
        const val MILLIS_PER_SECOND = 1000L
    }
}
