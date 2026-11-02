package me.meeshy.sdk.media.scene

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import com.google.common.truth.Truth.assertThat
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Test

class LeadingSilenceAudioProcessorTest {

    private fun pcm(vararg samples: Short): ByteBuffer =
        ByteBuffer.allocate(samples.size * 2).order(ByteOrder.nativeOrder()).also { b -> samples.forEach { b.putShort(it) }; b.flip() }

    private fun run(lead: Long, input: ByteBuffer): ByteBuffer {
        val p = LeadingSilenceAudioProcessor(lead)
        p.configure(AudioProcessor.AudioFormat(1000, 1, C.ENCODING_PCM_16BIT))
        p.flush()
        p.queueInput(input)
        return p.output
    }

    @Test
    fun `le silence precede le premier echantillon, puis le son passe intact`() {
        val out = run(lead = 2, input = pcm(7, 8)).order(ByteOrder.nativeOrder())
        assertThat(out.remaining()).isEqualTo((2 + 2) * 2)
        assertThat((0 until 4).map { out.getShort() }).containsExactly(0.toShort(), 0.toShort(), 7.toShort(), 8.toShort()).inOrder()
    }

    @Test
    fun `sans delai le son n est pas touche`() {
        val out = run(lead = 0, input = pcm(5)).order(ByteOrder.nativeOrder())
        assertThat(out.getShort()).isEqualTo(5.toShort())
    }

    @Test
    fun `le silence n est ecrit qu une fois`() {
        val p = LeadingSilenceAudioProcessor(2)
        p.configure(AudioProcessor.AudioFormat(1000, 1, C.ENCODING_PCM_16BIT))
        p.flush()
        p.queueInput(pcm(1))
        p.output
        p.queueInput(pcm(2))
        assertThat(p.output.remaining()).isEqualTo(2)
    }

    @Test
    fun `un format autre que PCM 16 bits est refuse`() {
        val p = LeadingSilenceAudioProcessor(1)
        try {
            p.configure(AudioProcessor.AudioFormat(1000, 1, C.ENCODING_PCM_FLOAT))
            throw AssertionError("attendu : refus")
        } catch (expected: AudioProcessor.UnhandledAudioFormatException) {
            // refus attendu
        }
    }
}
