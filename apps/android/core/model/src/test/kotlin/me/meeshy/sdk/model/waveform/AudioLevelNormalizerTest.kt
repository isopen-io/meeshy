package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [AudioLevelNormalizer.normalize] — the pure dB → `0..1`
 * amplitude mapping beneath the app-side recorder metering (feature-parity §P/§chat:
 * voice-note live waveform). Mirrors iOS `AudioRecorderManager.normalizeLevel`
 * (`max(power, -50)` then `(clamped + 50) / 50`), with the added upper clamp + NaN guard
 * that keep every bar height in range on a bogus frame.
 */
class AudioLevelNormalizerTest {

    @Test
    fun mapsZeroDbToFullAmplitude() {
        assertThat(AudioLevelNormalizer.normalize(0f)).isEqualTo(1f)
    }

    @Test
    fun mapsTheFloorDbToSilence() {
        assertThat(AudioLevelNormalizer.normalize(AudioLevelNormalizer.FLOOR_DB)).isEqualTo(0f)
    }

    @Test
    fun mapsTheMidpointDbToHalfAmplitude() {
        assertThat(AudioLevelNormalizer.normalize(-25f)).isWithin(1e-6f).of(0.5f)
    }

    @Test
    fun clampsReadingsBelowTheFloorToSilence() {
        assertThat(AudioLevelNormalizer.normalize(-120f)).isEqualTo(0f)
        assertThat(AudioLevelNormalizer.normalize(Float.NEGATIVE_INFINITY)).isEqualTo(0f)
    }

    @Test
    fun clampsPositiveReadingsToFullAmplitude() {
        assertThat(AudioLevelNormalizer.normalize(10f)).isEqualTo(1f)
    }

    @Test
    fun treatsNaNAsSilence() {
        assertThat(AudioLevelNormalizer.normalize(Float.NaN)).isEqualTo(0f)
    }

    @Test
    fun risesMonotonicallyBetweenFloorAndZero() {
        val quiet = AudioLevelNormalizer.normalize(-40f)
        val loud = AudioLevelNormalizer.normalize(-10f)
        assertThat(loud).isGreaterThan(quiet)
        assertThat(quiet).isWithin(1e-6f).of(0.2f)
        assertThat(loud).isWithin(1e-6f).of(0.8f)
    }
}
