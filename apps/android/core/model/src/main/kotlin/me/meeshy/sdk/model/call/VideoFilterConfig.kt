package me.meeshy.sdk.model.call

/**
 * Immutable configuration of the in-call video-filter pipeline: the colorimetry
 * (white balance, exposure, tone) plus the two GPU-heavy "advanced" passes
 * (background blur, skin smoothing). Pure value model — the SSOT the WebRTC
 * capture-frame actuator consumes to decide which Core-Image/RenderEffect passes
 * to apply. Faithful port of iOS `VideoFilterConfig` in `VideoFilterPipeline.swift`.
 *
 * @property temperature white-balance target in Kelvin; [DEFAULT] 6500 is neutral.
 * @property tint green/magenta bias; 0 is neutral.
 * @property brightness additive luma offset; 0 is neutral.
 * @property contrast multiplicative contrast; 1.0 is neutral.
 * @property saturation colour saturation multiplier; 1.0 is neutral.
 * @property exposure exposure-value offset; 0 is neutral.
 * @property isEnabled whether the pipeline runs at all (a disabled config is a
 *   pass-through — the capture frame is forwarded untouched).
 * @property backgroundBlurEnabled apply the segmentation-based background blur.
 * @property backgroundBlurRadius blur radius when [backgroundBlurEnabled].
 * @property skinSmoothingEnabled apply the face-detected skin-smoothing pass.
 * @property skinSmoothingIntensity smoothing strength (0..1) when enabled.
 */
data class VideoFilterConfig(
    val temperature: Float = 6500f,
    val tint: Float = 0f,
    val brightness: Float = 0f,
    val contrast: Float = 1.0f,
    val saturation: Float = 1.0f,
    val exposure: Float = 0f,
    val isEnabled: Boolean = false,
    val backgroundBlurEnabled: Boolean = false,
    val backgroundBlurRadius: Double = 10.0,
    val skinSmoothingEnabled: Boolean = false,
    val skinSmoothingIntensity: Float = 0.4f,
) {
    /**
     * `true` when either GPU-heavy advanced pass is requested. The auto-degrade
     * policy watches these — a config with only colorimetry is cheap and never
     * degrades. Mirrors iOS `hasAdvancedFilters`.
     */
    val hasAdvancedFilters: Boolean
        get() = backgroundBlurEnabled || skinSmoothingEnabled

    companion object {
        /** The neutral, disabled pass-through config. iOS `VideoFilterConfig.default`. */
        val DEFAULT = VideoFilterConfig()
    }
}

/**
 * The five one-tap colour presets offered in the call filter panel. Each carries
 * a stable [id] (the persisted raw value — never localise or reorder it) and
 * projects to an **enabled** [VideoFilterConfig] tuned to that mood. Faithful
 * port of iOS `VideoFilterPreset`; advanced filters are always off in a preset
 * (the user opts into blur/smoothing separately).
 */
enum class VideoFilterPreset(val id: String) {
    Natural("natural"),
    Warm("warm"),
    Cool("cool"),
    Vivid("vivid"),
    Muted("muted"),
    ;

    /** The colorimetry this preset applies, always with [VideoFilterConfig.isEnabled] set. */
    val config: VideoFilterConfig
        get() = when (this) {
            Natural -> VideoFilterConfig(isEnabled = true)
            Warm -> VideoFilterConfig(
                temperature = 7500f,
                tint = 5f,
                brightness = 0.02f,
                contrast = 1.05f,
                saturation = 1.1f,
                isEnabled = true,
            )
            Cool -> VideoFilterConfig(
                temperature = 5500f,
                tint = -5f,
                contrast = 1.05f,
                saturation = 0.95f,
                isEnabled = true,
            )
            Vivid -> VideoFilterConfig(
                brightness = 0.03f,
                contrast = 1.15f,
                saturation = 1.3f,
                exposure = 0.1f,
                isEnabled = true,
            )
            Muted -> VideoFilterConfig(
                brightness = -0.02f,
                contrast = 0.9f,
                saturation = 0.7f,
                exposure = -0.1f,
                isEnabled = true,
            )
        }

    companion object {
        /** Resolve a persisted [id] back to its preset, or `null` if unknown. */
        fun fromId(id: String): VideoFilterPreset? = entries.firstOrNull { it.id == id }
    }
}
