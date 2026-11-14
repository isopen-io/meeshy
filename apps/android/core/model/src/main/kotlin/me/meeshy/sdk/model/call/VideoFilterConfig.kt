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
 * @property naturalComplexionEnabled « Teint naturel » (#9196): on by default, imperceptible, cut as soon as the
 *   device protects itself. Not a filter one CHOSE — the base quality of the image — so it counts neither in
 *   [hasAdvancedFilters] nor in [hasChosenFilters].
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
    val faceEffect: CallFaceEffect = CallFaceEffect.None,
    val naturalComplexionEnabled: Boolean = true,
) {
    /**
     * `true` when a GPU-heavy advanced pass is requested (blur, smoothing, a stylized
     * face effect). The auto-degrade policy watches these — a config with only
     * colorimetry is cheap and never degrades. Mirrors iOS `hasAdvancedFilters`.
     */
    val hasAdvancedFilters: Boolean
        get() = backgroundBlurEnabled || skinSmoothingEnabled || faceEffect.isStylized

    /**
     * A filter the user CHOSE: a look ([isEnabled]) or an advanced pass — blur and
     * smoothing never set [isEnabled]. The call pipeline opens on it (iOS
     * `hasChosenFilters`, #11298).
     */
    val hasChosenFilters: Boolean
        get() = isEnabled || hasAdvancedFilters

    companion object {
        /** The neutral, disabled pass-through config. iOS `VideoFilterConfig.default`. */
        val DEFAULT = VideoFilterConfig()
    }
}

/**
 * The colour presets of a call. Each carries a stable [id] (the persisted raw value — never localise or
 * reorder it) and projects to an **enabled** [VideoFilterConfig] tuned to that mood. Faithful port of iOS
 * `VideoFilterPreset`; advanced filters are always off in a preset (the user opts into blur/smoothing separately).
 *
 * What is OFFERED is [catalog] (the eight moods of iOS, #17000); the four tints before them (Warm, Cool, Vivid,
 * Muted) stay here so that a draft or a call that carries one still reads it, but they are no longer proposed.
 */
enum class VideoFilterPreset(val id: String) {
    Natural("natural"),
    Warm("warm"),
    Cool("cool"),
    Vivid("vivid"),
    Muted("muted"),
    Golden("golden"),
    Film("film"),
    SoftNight("softNight"),
    Bright("bright"),
    Velvet("velvet"),
    Sky("sky"),
    Monochrome("monochrome"),
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
            Golden -> VideoFilterConfig(temperature = 6900f, tint = 3f, contrast = 1.04f, saturation = 1.04f, isEnabled = true)
            Film -> VideoFilterConfig(temperature = 6600f, tint = 1f, contrast = 1.08f, saturation = 0.86f, isEnabled = true)
            SoftNight -> VideoFilterConfig(
                temperature = 6100f,
                tint = -2f,
                contrast = 0.94f,
                saturation = 0.9f,
                exposure = 0.1f,
                isEnabled = true,
            )
            Bright -> VideoFilterConfig(temperature = 6600f, contrast = 0.96f, saturation = 0.82f, exposure = 0.15f, isEnabled = true)
            Velvet -> VideoFilterConfig(
                temperature = 6800f,
                tint = 2f,
                contrast = 1.12f,
                saturation = 1.08f,
                exposure = -0.05f,
                isEnabled = true,
            )
            Sky -> VideoFilterConfig(temperature = 6200f, tint = -1f, contrast = 1.08f, saturation = 1.12f, isEnabled = true)
            Monochrome -> VideoFilterConfig(contrast = 1.1f, saturation = 0f, isEnabled = true)
        }

    companion object {
        /** **The eight moods of Meeshy** (iOS `VideoFilterPreset.catalog`): what the viewfinder and the call offer, in this order. */
        val catalog: List<VideoFilterPreset> = listOf(Natural, Golden, Film, SoftNight, Bright, Velvet, Sky, Monochrome)

        /**
         * The five tints that were offered before the eight moods (Natural, Warm, Cool, Vivid, Muted). The
         * surfaces that have not yet adopted [catalog] (the composer strip, the old filter panel) keep exactly
         * these, so that adding the moods changes none of them.
         */
        val fiveTints: List<VideoFilterPreset> = listOf(Natural, Warm, Cool, Vivid, Muted)

        /** Resolve a persisted [id] back to its preset, or `null` if unknown. */
        fun fromId(id: String): VideoFilterPreset? = entries.firstOrNull { it.id == id }

        /**
         * Which preset produced [config]'s colorimetry, comparing temperature, tint,
         * contrast, saturation and exposure only — never `brightness` (the user's own
         * offset on top of a look), `isEnabled` or the advanced passes. iOS
         * `VideoFilterPreset.matching`.
         */
        fun matching(config: VideoFilterConfig): VideoFilterPreset? = entries.firstOrNull { preset ->
            val c = preset.config
            c.temperature == config.temperature && c.tint == config.tint && c.contrast == config.contrast &&
                c.saturation == config.saturation && c.exposure == config.exposure
        }
    }
}
