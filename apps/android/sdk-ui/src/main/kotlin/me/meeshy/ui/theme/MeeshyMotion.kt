package me.meeshy.ui.theme

import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.spring
import kotlin.math.PI

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

    /** iOS `bannerPullMorph` — response 0.42, damping 0.92: the banner grows into the conversation without trembling (#18721). */
    public fun <T> bannerPullMorph(): SpringSpec<T> =
        spring(dampingRatio = 0.92f, stiffness = stiffnessForResponse(0.42f))

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
}
