package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [MicAmplitudeDecibels.toDecibels] — the pure bridge between
 * a platform recorder's linear PCM amplitude reading (`android.media.MediaRecorder
 * .getMaxAmplitude()`, `0..32767`) and the decibel domain [AudioLevelNormalizer.normalize]
 * expects (mirrors iOS `AVAudioRecorder.averagePower(forChannel:)`, which reports directly
 * in dB — Android has no such API, so this conversion is genuinely new surface, not a port).
 */
class MicAmplitudeDecibelsTest {

    @Test
    fun zeroAmplitude_isSilence() {
        assertThat(AudioLevelNormalizer.normalize(MicAmplitudeDecibels.toDecibels(0))).isEqualTo(0f)
    }

    @Test
    fun negativeAmplitude_isTreatedAsSilence() {
        // Defensive: the platform never reports a negative amplitude, but a bogus
        // reading must never crash or invert the mapping.
        assertThat(MicAmplitudeDecibels.toDecibels(-5)).isEqualTo(MicAmplitudeDecibels.toDecibels(0))
        assertThat(AudioLevelNormalizer.normalize(MicAmplitudeDecibels.toDecibels(-5))).isEqualTo(0f)
    }

    @Test
    fun fullScaleAmplitude_isZeroDecibels() {
        assertThat(MicAmplitudeDecibels.toDecibels(MicAmplitudeDecibels.REFERENCE_AMPLITUDE))
            .isWithin(1e-4f).of(0f)
        assertThat(
            AudioLevelNormalizer.normalize(
                MicAmplitudeDecibels.toDecibels(MicAmplitudeDecibels.REFERENCE_AMPLITUDE),
            ),
        ).isEqualTo(1f)
    }

    @Test
    fun halfScaleAmplitude_isAboutMinusSixDecibels() {
        val half = MicAmplitudeDecibels.REFERENCE_AMPLITUDE / 2
        assertThat(MicAmplitudeDecibels.toDecibels(half)).isWithin(0.01f).of(-6.0206f)
    }

    @Test
    fun risesMonotonicallyWithAmplitude() {
        val quiet = MicAmplitudeDecibels.toDecibels(100)
        val medium = MicAmplitudeDecibels.toDecibels(1000)
        val loud = MicAmplitudeDecibels.toDecibels(MicAmplitudeDecibels.REFERENCE_AMPLITUDE)
        assertThat(medium).isGreaterThan(quiet)
        assertThat(loud).isGreaterThan(medium)
    }

    @Test
    fun aboveReferenceAmplitude_isStillFiniteAndNormalizesToFullScale() {
        // Defensive: getMaxAmplitude() is documented up to 32767, but a reading above the
        // reference must never produce NaN/Infinity that would break the normalizer.
        val overShoot = MicAmplitudeDecibels.toDecibels(MicAmplitudeDecibels.REFERENCE_AMPLITUDE * 2)
        assertThat(overShoot.isNaN()).isFalse()
        assertThat(AudioLevelNormalizer.normalize(overShoot)).isEqualTo(1f)
    }
}
