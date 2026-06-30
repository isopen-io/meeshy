package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryFilter

/**
 * A Compose-agnostic 4×5 colour matrix (row-major, 20 components) — the layout the
 * Android/Compose `ColorMatrix` expects: each of the four output channels (R', G',
 * B', A') is `aN0*R + aN1*G + aN2*B + aN3*A + aN4` over 0..255 channels (the fifth
 * column is the additive offset). Modelling it as a `List<Float>` keeps value
 * equality (so the rendering decision unit-tests on the JVM) and the Composable only
 * has to copy [values] into a `ColorMatrix` at the glue layer.
 */
data class StoryColorMatrix(val values: List<Float>) {
    init {
        require(values.size == COMPONENTS) { "a colour matrix has $COMPONENTS components (4×5)" }
    }

    /**
     * Linearly interpolates each component toward [other] by [t] (0 → this, 1 →
     * [other]), with [t] coerced into `0f..1f`. Callers must pass a finite [t];
     * [StoryFilterMatrix.effectiveMatrix] is the single entry point that guards a
     * non-finite intensity before it reaches here.
     */
    fun blend(other: StoryColorMatrix, t: Float): StoryColorMatrix {
        val k = t.coerceIn(0f, 1f)
        if (k <= 0f) return this
        if (k >= 1f) return other
        return StoryColorMatrix(values.zip(other.values) { a, b -> a + (b - a) * k })
    }

    companion object {
        const val COMPONENTS: Int = 20

        /** The neutral matrix — leaves every pixel unchanged. */
        val IDENTITY: StoryColorMatrix = StoryColorMatrix(
            listOf(
                1f, 0f, 0f, 0f, 0f,
                0f, 1f, 0f, 0f, 0f,
                0f, 0f, 1f, 0f, 0f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
    }
}

/**
 * The single source of truth for how each of the eight iOS [StoryFilter] presets
 * looks, plus the intensity blend toward the neutral [StoryColorMatrix.IDENTITY].
 * Pure and Compose-agnostic so the canvas Composable stays glue and the look of a
 * filter is unit-tested in one place. Mirrors iOS's per-slide photo filter with an
 * adjustable strength.
 */
object StoryFilterMatrix {
    /** Default filter strength — full effect, matching iOS's initial slider value. */
    const val DEFAULT_INTENSITY: Float = 1f

    /**
     * Folds [intensity] into the valid `0f..1f` range; a non-finite value collapses
     * to [DEFAULT_INTENSITY] so a broken slider reading can never poison the blend.
     */
    fun clampIntensity(intensity: Float): Float =
        if (intensity.isFinite()) intensity.coerceIn(0f, 1f) else DEFAULT_INTENSITY

    /**
     * The colour matrix for [filter] at full strength. Each preset is deliberately
     * distinct and none equals [StoryColorMatrix.IDENTITY], so applying a filter is
     * always visible at intensity 1.
     */
    fun baseMatrix(filter: StoryFilter): StoryColorMatrix = when (filter) {
        StoryFilter.VINTAGE -> StoryColorMatrix(
            listOf(
                0.393f, 0.769f, 0.189f, 0f, 0f,
                0.349f, 0.686f, 0.168f, 0f, 0f,
                0.272f, 0.534f, 0.131f, 0f, 0f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        StoryFilter.BW -> StoryColorMatrix(
            listOf(
                0.299f, 0.587f, 0.114f, 0f, 0f,
                0.299f, 0.587f, 0.114f, 0f, 0f,
                0.299f, 0.587f, 0.114f, 0f, 0f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        StoryFilter.WARM -> StoryColorMatrix(
            listOf(
                1.10f, 0f, 0f, 0f, 0f,
                0f, 1.02f, 0f, 0f, 0f,
                0f, 0f, 0.90f, 0f, 0f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        StoryFilter.COOL -> StoryColorMatrix(
            listOf(
                0.90f, 0f, 0f, 0f, 0f,
                0f, 1.00f, 0f, 0f, 0f,
                0f, 0f, 1.10f, 0f, 0f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        StoryFilter.DRAMATIC -> StoryColorMatrix(
            listOf(
                1.30f, 0f, 0f, 0f, -38.4f,
                0f, 1.30f, 0f, 0f, -38.4f,
                0f, 0f, 1.30f, 0f, -38.4f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        StoryFilter.VIVID -> StoryColorMatrix(
            listOf(
                1.3935f, -0.3575f, -0.0360f, 0f, 0f,
                -0.1065f, 1.1425f, -0.0360f, 0f, 0f,
                -0.1065f, -0.3575f, 1.4640f, 0f, 0f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        StoryFilter.FADE -> StoryColorMatrix(
            listOf(
                0.85f, 0f, 0f, 0f, 30f,
                0f, 0.85f, 0f, 0f, 30f,
                0f, 0f, 0.85f, 0f, 30f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        StoryFilter.CHROME -> StoryColorMatrix(
            listOf(
                1.15f, 0f, 0f, 0f, -19f,
                0f, 1.15f, 0f, 0f, -19f,
                0f, 0f, 1.20f, 0f, -15f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
    }

    /**
     * The matrix actually rendered for a slide: [StoryColorMatrix.IDENTITY] when no
     * [filter] is set or the strength resolves to 0, the full [baseMatrix] at strength
     * 1, and a proportional blend in between. [intensity] is clamped/guarded via
     * [clampIntensity].
     */
    fun effectiveMatrix(filter: StoryFilter?, intensity: Float): StoryColorMatrix {
        if (filter == null) return StoryColorMatrix.IDENTITY
        return StoryColorMatrix.IDENTITY.blend(baseMatrix(filter), clampIntensity(intensity))
    }
}

/**
 * The exact lowercase token the gateway expects for this filter on
 * `StoryEffects.filter` — the single mapping from the enum to its wire string, kept
 * beside the matrices so the look and the wire value never drift apart.
 */
fun StoryFilter.wireValue(): String = when (this) {
    StoryFilter.VINTAGE -> "vintage"
    StoryFilter.BW -> "bw"
    StoryFilter.WARM -> "warm"
    StoryFilter.COOL -> "cool"
    StoryFilter.DRAMATIC -> "dramatic"
    StoryFilter.VIVID -> "vivid"
    StoryFilter.FADE -> "fade"
    StoryFilter.CHROME -> "chrome"
}
