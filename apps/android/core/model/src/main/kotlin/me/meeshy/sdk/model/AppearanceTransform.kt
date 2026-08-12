package me.meeshy.sdk.model

import kotlin.math.PI
import kotlin.math.sin

/**
 * The resolved transform a one-shot *transform* appearance effect applies to a bubble at a
 * given animation progress. [translationX] is a horizontal shift in px (shake), [scale] a
 * uniform scale factor, [alpha] the content opacity, and [glowAlpha] the strength of an
 * accent glow behind the bubble (waoo). The identity ([IDENTITY]) leaves the bubble untouched.
 *
 * Pure and Android-free — the Compose `graphicsLayer` / `shadow` glue that applies it is
 * coverage-exempt UI wiring. This is the transform-effect counterpart to [ParticleField]
 * (which carries the confetti / fireworks geometry).
 */
data class AppearanceTransformSpec(
    val translationX: Float = 0f,
    val scale: Float = 1f,
    val alpha: Float = 1f,
    val glowAlpha: Float = 0f,
) {
    /** True when the transform is a no-op — nothing to translate, scale, fade or glow. */
    val isIdentity: Boolean
        get() = translationX == 0f && scale == 1f && alpha == 1f && glowAlpha == 0f

    companion object {
        /** The neutral transform: no shift, full size, fully opaque, no glow. */
        val IDENTITY: AppearanceTransformSpec = AppearanceTransformSpec()
    }
}

/**
 * Resolves the [AppearanceTransformSpec] a one-shot *transform* appearance effect applies at
 * an animation [progress] running `0f → 1f` — a pure port of the iOS `ShakeEffect` / `ZoomEffect`
 * / `ExplodeEffect` / `WaooEffect` `ViewModifier`s (`MessageEffectModifiers.swift`), whose
 * spring/ease timings iOS hardcodes inside `withAnimation`. Extracting the per-progress geometry
 * into a pure function makes every transform branch JVM-testable (the Compose layer only drives a
 * `0f → 1f` `Animatable` and applies the resolved spec).
 *
 * The four effects:
 * - **Shake** — a decaying-free horizontal oscillation, [SHAKE_OSCILLATIONS] half-cycles of
 *   amplitude [SHAKE_AMPLITUDE] px; starts and ends at rest (iOS `sin(phase · π · 4) · 8`).
 * - **Zoom** — a single-stage grow from [ZOOM_SCALE_START] to `1` (iOS spring `0.3 → 1`).
 * - **Explode** — a two-stage pop: grow from [EXPLODE_SCALE_START] to an overshoot
 *   [EXPLODE_SCALE_PEAK] while fading in ([alpha] `0 → 1`), then settle back to `1`.
 * - **Waoo** — a two-stage bounce: grow from [WAOO_SCALE_START] to [WAOO_SCALE_PEAK] while a
 *   glow rises to [WAOO_GLOW_PEAK], then settle to `1` as the glow fades out.
 *
 * The [CONFETTI] / [FIREWORKS] particle effects have no transform and resolve to `null` (their
 * geometry lives in [AppearanceParticleFields]). Non-transform inputs and out-of-range progress
 * are handled without a crash: [progress] is clamped to `0f..1f`.
 */
object AppearanceTransforms {
    /** Shake oscillation amplitude in px (iOS `· 8`). */
    const val SHAKE_AMPLITUDE: Float = 8f

    /** Shake half-cycles across the run — `sin(progress · π · 4)` = two full oscillations. */
    const val SHAKE_OSCILLATIONS: Float = 4f

    /** Zoom start scale (iOS `scale = 0.3`). */
    const val ZOOM_SCALE_START: Float = 0.3f

    /** Fraction of the run spent growing before the settle-back for the two-stage effects. */
    const val OVERSHOOT_AT: Float = 0.6f

    const val EXPLODE_SCALE_START: Float = 0.1f
    const val EXPLODE_SCALE_PEAK: Float = 1.15f

    const val WAOO_SCALE_START: Float = 0.5f
    const val WAOO_SCALE_PEAK: Float = 1.1f
    const val WAOO_GLOW_PEAK: Float = 0.6f

    private const val SETTLED_SCALE: Float = 1f

    /**
     * The appearance effects that render as a bubble transform (shake / zoom / explode / waoo),
     * as opposed to the particle-overlay effects. Derived from [forEffect] so it can never drift
     * from the resolver, and complementary to [AppearanceParticleFields.particleEffects] (every
     * appearance effect is in exactly one of the two).
     */
    val transformEffects: Set<AppearanceEffect> by lazy {
        AppearanceEffect.entries.filterTo(LinkedHashSet()) { forEffect(it, progress = 0f) != null }
    }

    /**
     * The transform an [effect] applies at [progress], or `null` for the particle-overlay
     * effects (confetti / fireworks). [progress] is clamped to `0f..1f`.
     */
    fun forEffect(effect: AppearanceEffect, progress: Float): AppearanceTransformSpec? {
        val p = progress.coerceIn(0f, 1f)
        return when (effect) {
            AppearanceEffect.SHAKE -> shake(p)
            AppearanceEffect.ZOOM -> zoom(p)
            AppearanceEffect.EXPLODE -> explode(p)
            AppearanceEffect.WAOO -> waoo(p)
            AppearanceEffect.CONFETTI,
            AppearanceEffect.FIREWORKS,
            -> null
        }
    }

    /**
     * Folds every transform effect in [effects] into a single combined spec at [progress]:
     * horizontal shifts add, scales multiply, opacities multiply, and the glow takes the
     * strongest. Non-transform effects contribute nothing. With no transform effect the result
     * is [AppearanceTransformSpec.IDENTITY], so a bubble with only particle (or no) effects is
     * left untouched.
     */
    fun resolve(effects: Set<AppearanceEffect>, progress: Float): AppearanceTransformSpec {
        val specs = effects.mapNotNull { forEffect(it, progress) }
        if (specs.isEmpty()) return AppearanceTransformSpec.IDENTITY
        return specs.fold(AppearanceTransformSpec.IDENTITY) { acc, spec ->
            AppearanceTransformSpec(
                translationX = acc.translationX + spec.translationX,
                scale = acc.scale * spec.scale,
                alpha = acc.alpha * spec.alpha,
                glowAlpha = maxOf(acc.glowAlpha, spec.glowAlpha),
            )
        }
    }

    private fun shake(p: Float): AppearanceTransformSpec =
        AppearanceTransformSpec(
            translationX = sin(p * PI.toFloat() * SHAKE_OSCILLATIONS) * SHAKE_AMPLITUDE,
        )

    private fun zoom(p: Float): AppearanceTransformSpec =
        AppearanceTransformSpec(scale = lerp(ZOOM_SCALE_START, SETTLED_SCALE, p))

    private fun explode(p: Float): AppearanceTransformSpec {
        if (p <= OVERSHOOT_AT) {
            val f = p / OVERSHOOT_AT
            return AppearanceTransformSpec(
                scale = lerp(EXPLODE_SCALE_START, EXPLODE_SCALE_PEAK, f),
                alpha = f,
            )
        }
        val f = (p - OVERSHOOT_AT) / (1f - OVERSHOOT_AT)
        return AppearanceTransformSpec(
            scale = lerp(EXPLODE_SCALE_PEAK, SETTLED_SCALE, f),
            alpha = 1f,
        )
    }

    private fun waoo(p: Float): AppearanceTransformSpec {
        if (p <= OVERSHOOT_AT) {
            val f = p / OVERSHOOT_AT
            return AppearanceTransformSpec(
                scale = lerp(WAOO_SCALE_START, WAOO_SCALE_PEAK, f),
                glowAlpha = lerp(0f, WAOO_GLOW_PEAK, f),
            )
        }
        val f = (p - OVERSHOOT_AT) / (1f - OVERSHOOT_AT)
        return AppearanceTransformSpec(
            scale = lerp(WAOO_SCALE_PEAK, SETTLED_SCALE, f),
            glowAlpha = lerp(WAOO_GLOW_PEAK, 0f, f),
        )
    }

    private fun lerp(start: Float, end: Float, fraction: Float): Float =
        start + (end - start) * fraction
}
