package me.meeshy.sdk.model.waveform

import kotlin.math.log10

/**
 * Converts a raw linear PCM amplitude reading — `android.media.MediaRecorder
 * .getMaxAmplitude()`, documented `0..32767` — into the decibel value
 * [AudioLevelNormalizer.normalize] expects.
 *
 * Android's `MediaRecorder` has no direct decibel-metering API (unlike iOS's
 * `AVAudioRecorder.averagePower(forChannel:)`, which already reports in dB), so this
 * conversion is genuinely new surface, not a port: the standard full-scale decibel
 * formula `20 * log10(amplitude / reference)`, [REFERENCE_AMPLITUDE] being the maximum
 * a 16-bit PCM sample can report (`Short.MAX_VALUE`).
 *
 * Kept pure in `:core:model` alongside [AudioLevelNormalizer]: the actual
 * `MediaRecorder` object and its `getMaxAmplitude()` polling loop are Android-runtime
 * glue that live app-side and feed each reading through here before it ever reaches
 * [AudioLevelNormalizer.normalize].
 */
public object MicAmplitudeDecibels {
    /** The ceiling `MediaRecorder.getMaxAmplitude()` reports for 16-bit PCM audio. */
    public const val REFERENCE_AMPLITUDE: Int = 32767

    /**
     * Silence (zero or a defensive negative reading) maps to [AudioLevelNormalizer.FLOOR_DB]
     * directly rather than through `log10`, which is undefined at zero and negative — never
     * produces `NaN`/`-Infinity` for the normalizer to special-case.
     */
    public fun toDecibels(amplitude: Int): Float {
        if (amplitude <= 0) return AudioLevelNormalizer.FLOOR_DB
        val ratio = amplitude.toDouble() / REFERENCE_AMPLITUDE.toDouble()
        return (20.0 * log10(ratio)).toFloat()
    }
}
