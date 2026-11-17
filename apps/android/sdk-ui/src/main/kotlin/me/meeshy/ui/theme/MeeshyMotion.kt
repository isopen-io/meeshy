package me.meeshy.ui.theme

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import kotlin.math.PI
import me.meeshy.ui.haptics.MeeshyHaptics

/**
 * Brand motion (charte graphique §13.6) — Meeshy animates with springs, never
 * linear easing. The three springs are the iOS `MeeshyAnimation` ones
 * (DesignTokens.swift), converted from SwiftUI's `(response, dampingFraction)` to
 * Compose's `(dampingRatio, stiffness)`:
 *
 * - `dampingRatio` is SwiftUI's `dampingFraction` as is;
 * - a SwiftUI spring has unit mass and oscillates (undamped) with a period of
 *   `response` seconds, so its stiffness is `ω² = (2π / response)²`.
 *
 * The signature staggered list entry is [STAGGER_STEP_MILLIS] per item index.
 */
public object MeeshyMotion {

    /** SwiftUI `response` (seconds) → Compose stiffness: `(2π / response)²`. */
    public fun stiffnessForResponse(response: Float): Float {
        require(response > 0f) { "response must be positive, was $response" }
        val angularFrequency = (2.0 * PI / response).toFloat()
        return angularFrequency * angularFrequency
    }

    /** iOS `springFast` — response 0.25, damping 0.7: press feedback, toggles, quick state changes. */
    public fun <T> springFast(): SpringSpec<T> =
        spring(dampingRatio = 0.7f, stiffness = stiffnessForResponse(0.25f))

    /** iOS `springDefault` — response 0.4, damping 0.75: the standard UI transition. */
    public fun <T> springDefault(): SpringSpec<T> =
        spring(dampingRatio = 0.75f, stiffness = stiffnessForResponse(0.4f))

    /** iOS `springBouncy` — response 0.5, damping 0.6: a playful brand moment, a gentle bounce. */
    public fun <T> springBouncy(): SpringSpec<T> =
        spring(dampingRatio = 0.6f, stiffness = stiffnessForResponse(0.5f))

    /** iOS `bannerPullReturn` — response 0.36, damping 0.66: the pulled banner springs back, with the elastic overshoot (#18721). */
    public fun <T> bannerPullReturn(): SpringSpec<T> =
        spring(dampingRatio = 0.66f, stiffness = stiffnessForResponse(0.36f))

    /** iOS `bannerPullMorph` — response 0.44, damping 0.9: the banner grows into the conversation without trembling (#18721). */
    public fun <T> bannerPullMorph(): SpringSpec<T> =
        spring(dampingRatio = 0.9f, stiffness = stiffnessForResponse(0.44f))

    /** iOS `previewMorph` — response 0.5, damping 0.72: the long-press preview grows out of its row and settles with a slight bounce (#18722, #18723). */
    public fun <T> previewMorph(): SpringSpec<T> =
        spring(dampingRatio = 0.72f, stiffness = stiffnessForResponse(0.5f))

    /** iOS `messagePreviewSettle` — response 0.42, damping 0.72: a message's long-press preview takes its place with the same slight bounce. */
    public fun <T> messagePreviewSettle(): SpringSpec<T> =
        spring(dampingRatio = 0.72f, stiffness = stiffnessForResponse(0.42f))

    /** iOS `messagePreviewPop` — response 0.42, damping 0.58: the previewed bubble grows past its size before settling. */
    public fun <T> messagePreviewPop(): SpringSpec<T> =
        spring(dampingRatio = 0.58f, stiffness = stiffnessForResponse(0.42f))

    /** iOS `previewMorphReturn` — response 0.3, damping 0.8: the preview shrinks back into its row, faster than it grew. */
    public fun <T> previewMorphReturn(): SpringSpec<T> =
        spring(dampingRatio = 0.8f, stiffness = stiffnessForResponse(0.3f))

    /** iOS `peekDetachReturn` — response 0.32, damping 0.72: the pulled preview released before detaching springs back. */
    public fun <T> peekDetachReturn(): SpringSpec<T> =
        spring(dampingRatio = 0.72f, stiffness = stiffnessForResponse(0.32f))

    /**
     * A spring from an iOS `(response, dampingFraction)` pair, for a component whose law owns its pair (the kit's anchored
     * sheet, K15: 0.32 / 0.88) — the same conversion as the three springs above, never a local `spring(...)` literal.
     */
    public fun <T> springFor(response: Float, dampingFraction: Float): SpringSpec<T> =
        spring(dampingRatio = dampingFraction, stiffness = stiffnessForResponse(response))

    /** Standard UI transition — the historic name of [springDefault]. */
    public fun <T> standardSpring(): SpringSpec<T> = springDefault()

    /** Playful transition for brand moments — the historic name of [springBouncy]. */
    public fun <T> bouncySpring(): SpringSpec<T> = springBouncy()

    /** Per-index delay for the staggered list-entry animation: iOS `staggerDelay` 0.04 s. */
    public const val STAGGER_STEP_MILLIS: Int = 40

    /** Delay before the item at [index] starts entering; the first item (and any negative index) starts at once. */
    public fun staggerDelayMillis(index: Int): Int = index.coerceAtLeast(0) * STAGGER_STEP_MILLIS

    /** Décalage d'un rang de la cascade `rise` : 80 ms (K26). */
    public const val CASCADE_STEP_MILLIS: Int = 80

    /** Rang le plus loin d'une cascade : quatre rangs au plus, donc trois pas. */
    public const val CASCADE_MAX_INDEX: Int = 3

    /** Délai du rang [index] de la cascade `rise` : borné à 3, un rang négatif vaut 0 (K26). */
    public fun delayMillis(index: Int): Int = index.coerceIn(0, CASCADE_MAX_INDEX) * CASCADE_STEP_MILLIS

    /** Avancement 0..1 d'un repli piloté (`collapse`), borné aux deux bouts ; un intervalle vide vaut 0 (K26). */
    public fun progress(offset: Float, range: ClosedFloatingPointRange<Float> = 0f..MeeshyMotionRecipe.COLLAPSE_RANGE_DP): Float {
        val span = range.endInclusive - range.start
        if (span <= 0f) return 0f
        return ((offset - range.start) / span).coerceIn(0f, 1f)
    }

    private val easeInOut = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)
    private val easeOut = CubicBezierEasing(0f, 0f, 0.58f, 1f)

    /**
     * L'animation d'un jeton pour la valeur [T] : le ressort de la table, ou son fondu de 160 ms sous [reduce]. Les boucles
     * (`float`, `pulse`) s'arrêtent sur leur image de repos ; `collapse`, conduit par le doigt, n'a pas de durée propre.
     */
    public fun <T> spec(token: MeeshyMotionToken, reduce: Boolean = false): AnimationSpec<T> {
        val values = MeeshyMotionRecipe.resolve(token, reduce)
        return when (values.nature) {
            MeeshyMotionNature.Spring -> springFor<T>(requireNotNull(values.response), requireNotNull(values.damping))
            MeeshyMotionNature.Timed -> tween<T>(values.durationMillis, easing = easeOut)
            MeeshyMotionNature.Driven, MeeshyMotionNature.Still -> snap<T>()
            MeeshyMotionNature.Loop -> when (token) {
                MeeshyMotionToken.Float -> infiniteRepeatable<T>(tween(values.durationMillis, easing = easeInOut), RepeatMode.Reverse)
                else -> infiniteRepeatable<T>(tween(values.durationMillis, easing = easeOut), RepeatMode.Restart)
            }
        }
    }

    /** Joue le retour d'un jeton par le site unique d'haptique ; [MeeshyMotionHaptic.None] laisse l'hôte jouer le sien. */
    public fun play(haptic: MeeshyMotionHaptic, haptics: MeeshyHaptics) {
        when (haptic) {
            MeeshyMotionHaptic.Light -> haptics.light()
            MeeshyMotionHaptic.Medium -> haptics.medium()
            MeeshyMotionHaptic.Rigid -> haptics.rigid()
            MeeshyMotionHaptic.None -> Unit
        }
    }
}
