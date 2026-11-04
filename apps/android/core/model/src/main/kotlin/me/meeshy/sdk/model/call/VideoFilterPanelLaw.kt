package me.meeshy.sdk.model.call

import kotlin.math.abs

/** One colorimetry slider of the filters panel (iOS `VideoFilterControlView`): range, neutral and the config field it drives. */
enum class VideoFilterSlider(val range: ClosedFloatingPointRange<Float>, val neutral: Float) {
    Temperature(0f..1f, 0.5f),
    Brightness(-0.5f..0.5f, 0f),
    Contrast(0.5f..1.5f, 1f),
    Saturation(0f..2f, 1f),
    Exposure(-1f..1f, 0f),
    ;

    /** The slider position of [config] (temperature is shown normalised, 3000..10000 K → 0..1). */
    fun valueOf(config: VideoFilterConfig): Float = when (this) {
        Temperature -> (config.temperature - TEMPERATURE_MIN_KELVIN) / TEMPERATURE_SPAN_KELVIN
        Brightness -> config.brightness
        Contrast -> config.contrast
        Saturation -> config.saturation
        Exposure -> config.exposure
    }

    /** [config] with this slider moved to [value] (clamped to its range); moving it turns the colorimetry on. */
    fun applying(config: VideoFilterConfig, value: Float): VideoFilterConfig {
        val v = value.coerceIn(range.start, range.endInclusive)
        return when (this) {
            Temperature -> config.copy(temperature = v * TEMPERATURE_SPAN_KELVIN + TEMPERATURE_MIN_KELVIN, isEnabled = true)
            Brightness -> config.copy(brightness = v, isEnabled = true)
            Contrast -> config.copy(contrast = v, isEnabled = true)
            Saturation -> config.copy(saturation = v, isEnabled = true)
            Exposure -> config.copy(exposure = v, isEnabled = true)
        }
    }

    /** The value text next to the slider: the signed offset from neutral, « 0 » near it (iOS `formatValue`). */
    fun displayOf(config: VideoFilterConfig): String {
        val diff = valueOf(config) - neutral
        if (abs(diff) < NEUTRAL_EPSILON) return "0"
        val tenths = Math.round(diff * 10f) / 10f
        return (if (diff > 0f) "+" else "") + tenths.toString()
    }

    private companion object {
        const val TEMPERATURE_MIN_KELVIN = 3000f
        const val TEMPERATURE_SPAN_KELVIN = 7000f
        const val NEUTRAL_EPSILON = 0.01f
    }
}

/**
 * **LA LOI DU PANNEAU « FILTRES VIDÉO »** — miroir de iOS `VideoFiltersPanel` / `VideoFilterControlView` :
 * what each tap does to the [VideoFilterConfig], independent of any screen.
 */
object VideoFilterPanelLaw {
    const val BLUR_RADIUS_MIN: Float = 5f
    const val BLUR_RADIUS_MAX: Float = 20f

    /** « Réinitialiser » of the header: the neutral look, colorimetry off (iOS `natural.config` with `isEnabled = false`). */
    fun resetLook(config: VideoFilterConfig): VideoFilterConfig =
        VideoFilterPreset.Natural.config.copy(isEnabled = false)

    /** The header's « Réinitialiser » shows while a look is on. */
    fun showsReset(config: VideoFilterConfig): Boolean = config.isEnabled

    /** The slider block's own reset: everything back to the default config; lit only when something differs. */
    fun isModified(config: VideoFilterConfig): Boolean = config != VideoFilterConfig.DEFAULT

    fun withBlurRadius(config: VideoFilterConfig, radius: Float): VideoFilterConfig =
        config.copy(backgroundBlurRadius = radius.toDouble().coerceIn(BLUR_RADIUS_MIN.toDouble(), BLUR_RADIUS_MAX.toDouble()))

    /** The chip of a preset is selected when the config's colorimetry matches it (derived, never stored). */
    fun isSelected(config: VideoFilterConfig, preset: VideoFilterPreset): Boolean = VideoFilterPreset.matching(config) == preset
}
