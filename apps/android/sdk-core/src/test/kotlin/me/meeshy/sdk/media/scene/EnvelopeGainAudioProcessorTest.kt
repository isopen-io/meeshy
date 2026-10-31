package me.meeshy.sdk.media.scene

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import com.google.common.truth.Truth.assertThat
import java.nio.ByteBuffer
import java.nio.ByteOrder
import me.meeshy.sdk.model.scene.export.StoryExportVolumePoint
import org.junit.Test

class EnvelopeGainAudioProcessorTest {

    private fun pcm(vararg samples: Short): ByteBuffer =
        ByteBuffer.allocate(samples.size * 2).order(ByteOrder.nativeOrder()).also { b -> samples.forEach { b.putShort(it) }; b.flip() }

    private fun EnvelopeGainAudioProcessor.played(input: ByteBuffer, channels: Int = 1): List<Short> {
        configure(AudioProcessor.AudioFormat(1000, channels, C.ENCODING_PCM_16BIT))
        flush()
        queueInput(input)
        val out = output.order(ByteOrder.nativeOrder())
        return (0 until out.remaining() / 2).map { out.getShort() }
    }

    @Test fun `la courbe de l auteur se lit echantillon par echantillon`() {
        val processor = EnvelopeGainAudioProcessor(gain = 1f, envelope = listOf(StoryExportVolumePoint(0, 0f), StoryExportVolumePoint(4, 1f)), originMillis = 0)
        assertThat(processor.played(pcm(1000, 1000, 1000, 1000, 1000))).containsExactly(0.toShort(), 250.toShort(), 500.toShort(), 750.toShort(), 1000.toShort()).inOrder()
    }

    @Test fun `un morceau qui commence plus tard lit la courbe a son heure`() {
        val processor = EnvelopeGainAudioProcessor(gain = 1f, envelope = listOf(StoryExportVolumePoint(0, 0f), StoryExportVolumePoint(4, 1f)), originMillis = 2)
        assertThat(processor.played(pcm(1000, 1000))).containsExactly(500.toShort(), 750.toShort()).inOrder()
    }

    @Test fun `les deux canaux d une meme image recoivent le meme gain`() {
        val processor = EnvelopeGainAudioProcessor(gain = 1f, envelope = listOf(StoryExportVolumePoint(0, 0f), StoryExportVolumePoint(2, 1f)), originMillis = 0)
        assertThat(processor.played(pcm(1000, -1000, 1000, -1000), channels = 2))
            .containsExactly(0.toShort(), 0.toShort(), 500.toShort(), (-500).toShort()).inOrder()
    }

    @Test fun `un gain amplifie sature au lieu de deborder`() {
        val processor = EnvelopeGainAudioProcessor(gain = 2f, envelope = emptyList(), originMillis = 0)
        assertThat(processor.played(pcm(20_000, -20_000, 100))).containsExactly(Short.MAX_VALUE, Short.MIN_VALUE, 200.toShort()).inOrder()
    }

    @Test fun `un gain unite sans courbe laisse le son intact`() {
        val processor = EnvelopeGainAudioProcessor(gain = 1f, envelope = emptyList(), originMillis = 0)
        assertThat(processor.played(pcm(7, -8))).containsExactly(7.toShort(), (-8).toShort()).inOrder()
    }

    @Test fun `une remise a zero relit la courbe depuis l origine`() {
        val processor = EnvelopeGainAudioProcessor(gain = 1f, envelope = listOf(StoryExportVolumePoint(0, 0f), StoryExportVolumePoint(4, 1f)), originMillis = 0)
        processor.played(pcm(1000, 1000, 1000))
        processor.flush()
        processor.queueInput(pcm(1000))
        assertThat(processor.output.order(ByteOrder.nativeOrder()).getShort()).isEqualTo(0.toShort())
    }
}
