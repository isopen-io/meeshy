package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioEnvelopeTest {

    private fun plan(entered: Double, fadeIn: Double = 2.0, fadeOut: Double = 2.0, duration: Double = 10.0, target: Float = 1f) =
        AudioEnvelope.plan(entered, fadeIn, fadeOut, duration, target)

    @Test
    fun `a clip starting at zero rises from silence and falls at its tail`() {
        val envelope = plan(0.0)
        assertThat(envelope.initialVolume).isEqualTo(0f)
        assertThat(envelope.fadeIn).isEqualTo(AudioEnvelope.Ramp(0f, 1f, 0.0, 2.0))
        assertThat(envelope.fadeOut).isEqualTo(AudioEnvelope.Ramp(1f, 0f, 8.0, 2.0))
    }

    @Test
    fun `a clip entered halfway through its fade in starts at half volume and only ramps what remains`() {
        val envelope = plan(1.0)
        assertThat(envelope.initialVolume).isEqualTo(0.5f)
        assertThat(envelope.fadeIn).isEqualTo(AudioEnvelope.Ramp(0.5f, 1f, 1.0, 1.0))
    }

    @Test
    fun `a clip entered after its fade in starts at the target volume with no rise`() {
        val envelope = plan(4.0, target = 0.8f)
        assertThat(envelope.initialVolume).isEqualTo(0.8f)
        assertThat(envelope.fadeIn).isNull()
    }

    @Test
    fun `a clip entered inside its fade out has no rise and a single falling ramp from the right level`() {
        val envelope = plan(9.0)
        assertThat(envelope.fadeIn).isNull()
        assertThat(envelope.initialVolume).isEqualTo(0.5f)
        assertThat(envelope.fadeOut).isEqualTo(AudioEnvelope.Ramp(0.5f, 0f, 9.0, 1.0))
    }

    @Test
    fun `a clip entered past its end is silent with no ramp at all`() {
        val envelope = plan(12.0)
        assertThat(envelope).isEqualTo(AudioEnvelope(0f, null, null))
    }

    @Test
    fun `non finite seconds count as zero and never produce a silent envelope`() {
        val envelope = AudioEnvelope.plan(Double.NaN, Double.NaN, Double.POSITIVE_INFINITY, 10.0, 1f)
        assertThat(envelope.initialVolume).isEqualTo(1f)
        assertThat(envelope.fadeIn).isNull()
    }
}
