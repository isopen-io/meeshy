package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the one-shot appearance *transforms* — the pure per-progress geometry
 * beneath the shake / zoom / explode / waoo bubble animations (ports iOS `ShakeEffect` /
 * `ZoomEffect` / `ExplodeEffect` / `WaooEffect`). Asserts the boundary states (rest at the ends),
 * the overshoot-and-settle shape of the two-stage effects, progress clamping, the particle-effect
 * `null`, and the multi-effect fold — never a literal the test itself set.
 */
class AppearanceTransformTest {

    private val eps = 1e-4f

    // MARK: - Shake

    @Test
    fun shakeStartsAndEndsAtRest() {
        // sin(0) = 0 and sin(4π) = 0 → the oscillation returns to centre at both ends.
        assertThat(AppearanceTransforms.forEffect(AppearanceEffect.SHAKE, 0f)!!.translationX)
            .isWithin(eps).of(0f)
        assertThat(AppearanceTransforms.forEffect(AppearanceEffect.SHAKE, 1f)!!.translationX)
            .isWithin(eps).of(0f)
    }

    @Test
    fun shakeSwingsToFullAmplitudeAtTheFirstQuarter() {
        // sin(0.125 · π · 4) = sin(π/2) = 1 → peak swing of +amplitude at an eighth of the run.
        val spec = AppearanceTransforms.forEffect(AppearanceEffect.SHAKE, 0.125f)!!
        assertThat(spec.translationX).isWithin(eps).of(AppearanceTransforms.SHAKE_AMPLITUDE)
    }

    @Test
    fun shakeSwingsNegativeInTheSecondHalfCycle() {
        // sin(0.375 · π · 4) = sin(3π/2) = -1 → opposite swing later in the run.
        val spec = AppearanceTransforms.forEffect(AppearanceEffect.SHAKE, 0.375f)!!
        assertThat(spec.translationX).isWithin(eps).of(-AppearanceTransforms.SHAKE_AMPLITUDE)
    }

    @Test
    fun shakeDoesNotScaleFadeOrGlow() {
        val spec = AppearanceTransforms.forEffect(AppearanceEffect.SHAKE, 0.3f)!!
        assertThat(spec.scale).isWithin(eps).of(1f)
        assertThat(spec.alpha).isWithin(eps).of(1f)
        assertThat(spec.glowAlpha).isWithin(eps).of(0f)
    }

    // MARK: - Zoom

    @Test
    fun zoomStartsSmallAndEndsAtFullSize() {
        assertThat(AppearanceTransforms.forEffect(AppearanceEffect.ZOOM, 0f)!!.scale)
            .isWithin(eps).of(AppearanceTransforms.ZOOM_SCALE_START)
        assertThat(AppearanceTransforms.forEffect(AppearanceEffect.ZOOM, 1f)!!.scale)
            .isWithin(eps).of(1f)
    }

    @Test
    fun zoomGrowsMonotonicallyAndNeverOvershoots() {
        val quarter = AppearanceTransforms.forEffect(AppearanceEffect.ZOOM, 0.25f)!!.scale
        val half = AppearanceTransforms.forEffect(AppearanceEffect.ZOOM, 0.5f)!!.scale
        val threeQuarter = AppearanceTransforms.forEffect(AppearanceEffect.ZOOM, 0.75f)!!.scale
        assertThat(quarter).isLessThan(half)
        assertThat(half).isLessThan(threeQuarter)
        // single-stage grow: never exceeds full size
        assertThat(threeQuarter).isLessThan(1f)
    }

    @Test
    fun zoomIsFullyOpaqueThroughout() {
        assertThat(AppearanceTransforms.forEffect(AppearanceEffect.ZOOM, 0.4f)!!.alpha)
            .isWithin(eps).of(1f)
    }

    // MARK: - Explode

    @Test
    fun explodeStartsTinyAndTransparent() {
        val spec = AppearanceTransforms.forEffect(AppearanceEffect.EXPLODE, 0f)!!
        assertThat(spec.scale).isWithin(eps).of(AppearanceTransforms.EXPLODE_SCALE_START)
        assertThat(spec.alpha).isWithin(eps).of(0f)
    }

    @Test
    fun explodeOvershootsPeakAtTheStageBoundaryThenSettlesToFullSize() {
        val peak = AppearanceTransforms.forEffect(
            AppearanceEffect.EXPLODE, AppearanceTransforms.OVERSHOOT_AT,
        )!!
        // at the boundary the pop is at its largest and fully faded in
        assertThat(peak.scale).isWithin(eps).of(AppearanceTransforms.EXPLODE_SCALE_PEAK)
        assertThat(peak.scale).isGreaterThan(1f)
        assertThat(peak.alpha).isWithin(eps).of(1f)
        // by the end it has settled back to rest
        val end = AppearanceTransforms.forEffect(AppearanceEffect.EXPLODE, 1f)!!
        assertThat(end.scale).isWithin(eps).of(1f)
        assertThat(end.alpha).isWithin(eps).of(1f)
    }

    @Test
    fun explodeFadesInDuringTheGrowStage() {
        // halfway through the grow stage → half opacity
        val mid = AppearanceTransforms.forEffect(
            AppearanceEffect.EXPLODE, AppearanceTransforms.OVERSHOOT_AT / 2f,
        )!!
        assertThat(mid.alpha).isWithin(eps).of(0.5f)
        assertThat(mid.scale).isGreaterThan(AppearanceTransforms.EXPLODE_SCALE_START)
        assertThat(mid.scale).isLessThan(AppearanceTransforms.EXPLODE_SCALE_PEAK)
    }

    @Test
    fun explodeSettleStageStaysFullyOpaqueAndShrinksFromPeak() {
        // just past the boundary opacity is pinned at 1 and scale is easing down from the peak
        val settling = AppearanceTransforms.forEffect(AppearanceEffect.EXPLODE, 0.8f)!!
        assertThat(settling.alpha).isWithin(eps).of(1f)
        assertThat(settling.scale).isLessThan(AppearanceTransforms.EXPLODE_SCALE_PEAK)
        assertThat(settling.scale).isGreaterThan(1f)
    }

    // MARK: - Waoo

    @Test
    fun waooStartsSmallWithNoGlow() {
        val spec = AppearanceTransforms.forEffect(AppearanceEffect.WAOO, 0f)!!
        assertThat(spec.scale).isWithin(eps).of(AppearanceTransforms.WAOO_SCALE_START)
        assertThat(spec.glowAlpha).isWithin(eps).of(0f)
    }

    @Test
    fun waooGlowPeaksAtTheBoundaryThenFadesToZeroAsItSettles() {
        val peak = AppearanceTransforms.forEffect(
            AppearanceEffect.WAOO, AppearanceTransforms.OVERSHOOT_AT,
        )!!
        assertThat(peak.scale).isWithin(eps).of(AppearanceTransforms.WAOO_SCALE_PEAK)
        assertThat(peak.glowAlpha).isWithin(eps).of(AppearanceTransforms.WAOO_GLOW_PEAK)
        // end: back to rest, glow gone
        val end = AppearanceTransforms.forEffect(AppearanceEffect.WAOO, 1f)!!
        assertThat(end.scale).isWithin(eps).of(1f)
        assertThat(end.glowAlpha).isWithin(eps).of(0f)
    }

    @Test
    fun waooGlowIsHalfStrengthMidwayThroughTheSettleStage() {
        // midpoint of the settle stage → glow half of its peak
        val mid = AppearanceTransforms.forEffect(
            AppearanceEffect.WAOO,
            AppearanceTransforms.OVERSHOOT_AT + (1f - AppearanceTransforms.OVERSHOOT_AT) / 2f,
        )!!
        assertThat(mid.glowAlpha).isWithin(eps).of(AppearanceTransforms.WAOO_GLOW_PEAK / 2f)
    }

    // MARK: - Particle effects have no transform

    @Test
    fun confettiAndFireworksHaveNoTransform() {
        assertThat(AppearanceTransforms.forEffect(AppearanceEffect.CONFETTI, 0.5f)).isNull()
        assertThat(AppearanceTransforms.forEffect(AppearanceEffect.FIREWORKS, 0.5f)).isNull()
    }

    // MARK: - Progress clamping

    @Test
    fun progressBelowZeroClampsToTheStart() {
        assertThat(AppearanceTransforms.forEffect(AppearanceEffect.ZOOM, -3f)!!.scale)
            .isWithin(eps).of(AppearanceTransforms.forEffect(AppearanceEffect.ZOOM, 0f)!!.scale)
    }

    @Test
    fun progressAboveOneClampsToTheEnd() {
        assertThat(AppearanceTransforms.forEffect(AppearanceEffect.EXPLODE, 5f)!!.scale)
            .isWithin(eps).of(1f)
    }

    // MARK: - transformEffects set (SSOT, complementary to particleEffects)

    @Test
    fun transformEffectsAreExactlyTheFourAnimatedBubbleEffects() {
        assertThat(AppearanceTransforms.transformEffects).containsExactly(
            AppearanceEffect.SHAKE,
            AppearanceEffect.ZOOM,
            AppearanceEffect.EXPLODE,
            AppearanceEffect.WAOO,
        )
    }

    @Test
    fun transformAndParticleEffectsPartitionEveryAppearanceEffect() {
        val transform = AppearanceTransforms.transformEffects
        val particle = AppearanceParticleFields.particleEffects
        // disjoint
        assertThat(transform.intersect(particle)).isEmpty()
        // exhaustive
        assertThat(transform + particle).isEqualTo(AppearanceEffect.entries.toSet())
    }

    // MARK: - resolve() fold

    @Test
    fun resolveWithNoTransformEffectsIsIdentity() {
        assertThat(AppearanceTransforms.resolve(emptySet(), 0.5f))
            .isEqualTo(AppearanceTransformSpec.IDENTITY)
        // a set of only particle effects also folds to identity
        assertThat(
            AppearanceTransforms.resolve(
                setOf(AppearanceEffect.CONFETTI, AppearanceEffect.FIREWORKS), 0.5f,
            ),
        ).isEqualTo(AppearanceTransformSpec.IDENTITY)
    }

    @Test
    fun resolveWithASingleEffectMatchesForEffect() {
        assertThat(AppearanceTransforms.resolve(setOf(AppearanceEffect.ZOOM), 0.4f))
            .isEqualTo(AppearanceTransforms.forEffect(AppearanceEffect.ZOOM, 0.4f))
    }

    @Test
    fun resolveAddsShiftsMultipliesScalesAndTakesStrongestGlow() {
        // shake (offset, scale 1) + waoo (scale, glow) at the glow-peak boundary
        val combined = AppearanceTransforms.resolve(
            setOf(AppearanceEffect.SHAKE, AppearanceEffect.WAOO),
            AppearanceTransforms.OVERSHOOT_AT,
        )
        val shake = AppearanceTransforms.forEffect(AppearanceEffect.SHAKE, AppearanceTransforms.OVERSHOOT_AT)!!
        val waoo = AppearanceTransforms.forEffect(AppearanceEffect.WAOO, AppearanceTransforms.OVERSHOOT_AT)!!
        assertThat(combined.translationX).isWithin(eps).of(shake.translationX + waoo.translationX)
        assertThat(combined.scale).isWithin(eps).of(shake.scale * waoo.scale)
        // shake contributes no glow; the combined glow is waoo's peak (strongest)
        assertThat(combined.glowAlpha).isWithin(eps).of(AppearanceTransforms.WAOO_GLOW_PEAK)
    }

    @Test
    fun resolveMultipliesOpacitiesSoAFadingEffectDimsTheWhole() {
        // explode fades in (alpha 0.5 midway through grow) → the combined opacity is dimmed too
        val progress = AppearanceTransforms.OVERSHOOT_AT / 2f
        val combined = AppearanceTransforms.resolve(
            setOf(AppearanceEffect.EXPLODE, AppearanceEffect.ZOOM), progress,
        )
        assertThat(combined.alpha).isWithin(eps).of(0.5f)
    }

    // MARK: - AppearanceTransformSpec.isIdentity

    @Test
    fun identitySpecReportsIsIdentityAndAnyDeviationDoesNot() {
        assertThat(AppearanceTransformSpec.IDENTITY.isIdentity).isTrue()
        assertThat(AppearanceTransformSpec(translationX = 1f).isIdentity).isFalse()
        assertThat(AppearanceTransformSpec(scale = 0.9f).isIdentity).isFalse()
        assertThat(AppearanceTransformSpec(alpha = 0.5f).isIdentity).isFalse()
        assertThat(AppearanceTransformSpec(glowAlpha = 0.2f).isIdentity).isFalse()
    }
}
