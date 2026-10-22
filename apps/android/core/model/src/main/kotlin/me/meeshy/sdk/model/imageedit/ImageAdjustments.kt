package me.meeshy.sdk.model.imageedit

import kotlin.math.abs

/** Un des onze curseurs de réglage non destructifs. Miroir d'iOS `AdjustmentKind`. */
public enum class AdjustmentKind(
    public val wireName: String,
    public val min: Float,
    public val max: Float,
    public val neutral: Float,
    public val isEssential: Boolean = false,
) {
    EXPOSURE("exposure", -2f, 2f, 0f),
    BRIGHTNESS("brightness", -0.4f, 0.4f, 0f, isEssential = true),
    CONTRAST("contrast", 0.5f, 1.5f, 1f, isEssential = true),
    SATURATION("saturation", 0f, 2f, 1f, isEssential = true),
    VIBRANCE("vibrance", -1f, 1f, 0f),
    TEMPERATURE("temperature", -1f, 1f, 0f),
    SHARPNESS("sharpness", 0f, 1f, 0f),
    BLUR("blur", 0f, 1f, 0f),
    VIGNETTE("vignette", 0f, 2f, 0f),
    BLOOM("bloom", 0f, 1f, 0f),
    GRAIN("grain", 0f, 1f, 0f);

    public fun clamp(value: Float): Float = value.coerceIn(min, max)

    public companion object {
        public fun rail(mode: ImageEditorMode): List<AdjustmentKind> =
            if (mode.isPro) entries.toList() else entries.filter { it.isEssential }
    }
}

/** Sac des onze réglages ; toutes les valeurs par défaut sont neutres. Immuable, borné. */
public data class ImageAdjustments(
    val exposure: Float = 0f,
    val brightness: Float = 0f,
    val contrast: Float = 1f,
    val saturation: Float = 1f,
    val vibrance: Float = 0f,
    val temperature: Float = 0f,
    val sharpness: Float = 0f,
    val blur: Float = 0f,
    val vignette: Float = 0f,
    val bloom: Float = 0f,
    val grain: Float = 0f,
) {
    public val isNeutral: Boolean
        get() = this == NEUTRAL

    public operator fun get(kind: AdjustmentKind): Float = when (kind) {
        AdjustmentKind.EXPOSURE -> exposure
        AdjustmentKind.BRIGHTNESS -> brightness
        AdjustmentKind.CONTRAST -> contrast
        AdjustmentKind.SATURATION -> saturation
        AdjustmentKind.VIBRANCE -> vibrance
        AdjustmentKind.TEMPERATURE -> temperature
        AdjustmentKind.SHARPNESS -> sharpness
        AdjustmentKind.BLUR -> blur
        AdjustmentKind.VIGNETTE -> vignette
        AdjustmentKind.BLOOM -> bloom
        AdjustmentKind.GRAIN -> grain
    }

    /** Copie avec [kind] posé à [value] ramené dans sa plage ; une valeur non finie est ignorée. */
    public fun with(kind: AdjustmentKind, value: Float): ImageAdjustments {
        if (!value.isFinite()) return this
        val v = kind.clamp(value)
        return when (kind) {
            AdjustmentKind.EXPOSURE -> copy(exposure = v)
            AdjustmentKind.BRIGHTNESS -> copy(brightness = v)
            AdjustmentKind.CONTRAST -> copy(contrast = v)
            AdjustmentKind.SATURATION -> copy(saturation = v)
            AdjustmentKind.VIBRANCE -> copy(vibrance = v)
            AdjustmentKind.TEMPERATURE -> copy(temperature = v)
            AdjustmentKind.SHARPNESS -> copy(sharpness = v)
            AdjustmentKind.BLUR -> copy(blur = v)
            AdjustmentKind.VIGNETTE -> copy(vignette = v)
            AdjustmentKind.BLOOM -> copy(bloom = v)
            AdjustmentKind.GRAIN -> copy(grain = v)
        }
    }

    public fun isActive(kind: AdjustmentKind): Boolean = abs(this[kind] - kind.neutral) > EPSILON

    public val activeCount: Int
        get() = AdjustmentKind.entries.count(::isActive)

    /** Seules les valeurs actives, par nom de fil : ce qui voyage. */
    public val activeValues: Map<String, Float>
        get() = AdjustmentKind.entries.filter(::isActive).associate { it.wireName to this[it] }

    public companion object {
        public val NEUTRAL: ImageAdjustments = ImageAdjustments()
        private const val EPSILON: Float = 0.0001f

        /** Reconstruit depuis [activeValues] : clés inconnues ignorées, absentes neutres, valeurs bornées. */
        public fun fromValues(values: Map<String, Double>): ImageAdjustments =
            AdjustmentKind.entries.fold(NEUTRAL) { acc, kind ->
                values[kind.wireName]?.let { acc.with(kind, it.toFloat()) } ?: acc
            }
    }
}
