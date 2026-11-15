package me.meeshy.sdk.model.brand

import com.google.common.truth.Truth.assertThat
import kotlin.math.abs
import kotlin.math.sqrt
import org.junit.Test

class MeeshyBrandJingleTest {

    @Test
    fun `the jingle lasts 2_2 seconds at 48 kHz`() {
        assertThat(MeeshyBrandJingle.samples().size).isEqualTo(105_600)
    }

    @Test
    fun `the outro lasts 2 seconds`() {
        assertThat(MeeshyBrandJingle.outroSamples().size).isEqualTo(96_000)
    }

    @Test
    fun `the motif is A major arpeggio entering at 0 0_28 0_56 and 0_84 seconds`() {
        assertThat(MeeshyBrandJingle.motif.map { it.frequency })
            .containsExactly(440.00, 554.37, 659.25, 880.00).inOrder()
        assertThat(MeeshyBrandJingle.motif.map { it.onsetSeconds })
            .containsExactly(0.0, 0.28, 0.56, 0.84).inOrder()
    }

    @Test
    fun `the outro mirrors the entry downwards`() {
        assertThat(MeeshyBrandJingle.outroMotif.map { it.frequency })
            .containsExactly(880.00, 659.25, 554.37, 440.00).inOrder()
    }

    @Test
    fun `the last sample is an exact silence and the first starts from zero`() {
        val pcm = MeeshyBrandJingle.samples()
        assertThat(pcm.first()).isEqualTo(0f)
        assertThat(abs(pcm.last())).isLessThan(1e-4f)
    }

    @Test
    fun `the peak is normalised to 0_62 without clipping`() {
        val peak = MeeshyBrandJingle.samples().maxOf { abs(it) }
        assertThat(peak).isWithin(1e-4f).of(0.62f)
    }

    @Test
    fun `the jingle carries energy early and none in the release tail end`() {
        val pcm = MeeshyBrandJingle.samples()
        val rms = { from: Int, to: Int -> sqrt(pcm.slice(from until to).sumOf { (it * it).toDouble() } / (to - from)).toFloat() }
        assertThat(rms(0, 48_000)).isGreaterThan(0.1f)
        assertThat(rms(pcm.size - 48, pcm.size)).isLessThan(0.001f)
    }

    @Test
    fun `rendering twice gives the same samples to the bit`() {
        assertThat(MeeshyBrandJingle.samples()).isEqualTo(MeeshyBrandJingle.samples())
    }
}
