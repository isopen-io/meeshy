package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [WaveformInterpolator.interpolate] — the pure resampling of
 * sampled audio levels onto a fixed bar count (ports iOS
 * `UniversalComposerBar.interpolatedLevel`, returning the whole strip at once). Asserts
 * the linear-blend values, exact endpoints, up-/down-sampling, and every degenerate case.
 */
class WaveformInterpolatorTest {

    @Test
    fun nonPositiveBarCountYieldsAnEmptyStrip() {
        assertThat(WaveformInterpolator.interpolate(listOf(0.5f), barCount = 0)).isEmpty()
        assertThat(WaveformInterpolator.interpolate(listOf(0.5f), barCount = -3)).isEmpty()
    }

    @Test
    fun noSamplesYieldsAFlatSilentStrip() {
        assertThat(WaveformInterpolator.interpolate(emptyList(), barCount = 4))
            .containsExactly(0f, 0f, 0f, 0f).inOrder()
    }

    @Test
    fun singleSampleFillsEveryBarWithThatLevel() {
        assertThat(WaveformInterpolator.interpolate(listOf(0.6f), barCount = 3))
            .containsExactly(0.6f, 0.6f, 0.6f).inOrder()
    }

    @Test
    fun singleBarTakesTheFirstSample() {
        assertThat(WaveformInterpolator.interpolate(listOf(0.3f, 0.9f), barCount = 1))
            .containsExactly(0.3f).inOrder()
    }

    @Test
    fun upsamplingInsertsLinearMidpoints() {
        val strip = WaveformInterpolator.interpolate(listOf(0f, 1f), barCount = 3)
        assertThat(strip).hasSize(3)
        assertThat(strip[0]).isWithin(1e-6f).of(0f)
        assertThat(strip[1]).isWithin(1e-6f).of(0.5f)
        assertThat(strip[2]).isWithin(1e-6f).of(1f)
    }

    @Test
    fun upsamplingIsLinearAtQuarterPoints() {
        val strip = WaveformInterpolator.interpolate(listOf(0f, 1f), barCount = 5)
        assertThat(strip[1]).isWithin(1e-6f).of(0.25f)
        assertThat(strip[2]).isWithin(1e-6f).of(0.5f)
        assertThat(strip[3]).isWithin(1e-6f).of(0.75f)
    }

    @Test
    fun downsamplingPicksTheAlignedSamples() {
        val levels = listOf(0f, 0.5f, 1f, 0.5f, 0f)
        val strip = WaveformInterpolator.interpolate(levels, barCount = 3)
        assertThat(strip[0]).isWithin(1e-6f).of(0f)
        assertThat(strip[1]).isWithin(1e-6f).of(1f)
        assertThat(strip[2]).isWithin(1e-6f).of(0f)
    }

    @Test
    fun endpointsAreAlwaysExactRegardlessOfBarCount() {
        val levels = listOf(0.2f, 0.7f, 0.4f, 0.9f)
        val strip = WaveformInterpolator.interpolate(levels, barCount = 11)
        assertThat(strip.first()).isWithin(1e-6f).of(0.2f)
        assertThat(strip.last()).isWithin(1e-6f).of(0.9f)
        assertThat(strip).hasSize(11)
    }

    @Test
    fun interpolatesBetweenNonUniformNeighbours() {
        // levels [0.2, 0.6, 0.4], barCount 5 -> positions 0, 0.5, 1.0, 1.5, 2.0
        val strip = WaveformInterpolator.interpolate(listOf(0.2f, 0.6f, 0.4f), barCount = 5)
        assertThat(strip[0]).isWithin(1e-6f).of(0.2f)
        assertThat(strip[1]).isWithin(1e-6f).of(0.4f) // midway 0.2..0.6
        assertThat(strip[2]).isWithin(1e-6f).of(0.6f)
        assertThat(strip[3]).isWithin(1e-6f).of(0.5f) // midway 0.6..0.4
        assertThat(strip[4]).isWithin(1e-6f).of(0.4f)
    }

    @Test
    fun equalBarCountAndSampleCountIsAnIdentityMapping() {
        val levels = listOf(0.1f, 0.5f, 0.9f)
        val strip = WaveformInterpolator.interpolate(levels, barCount = 3)
        assertThat(strip[0]).isWithin(1e-6f).of(0.1f)
        assertThat(strip[1]).isWithin(1e-6f).of(0.5f)
        assertThat(strip[2]).isWithin(1e-6f).of(0.9f)
    }
}
