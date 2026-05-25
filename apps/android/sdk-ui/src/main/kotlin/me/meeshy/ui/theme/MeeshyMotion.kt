package me.meeshy.ui.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.spring

/**
 * Brand motion (charte graphique §13.6) — Meeshy animates with springs, never
 * linear easing. The signature staggered list entry is `staggerStepMillis` per
 * item index.
 */
public object MeeshyMotion {

    /** Standard UI transition — settled, minimal overshoot. */
    public fun <T> standardSpring(): SpringSpec<T> =
        spring(dampingRatio = 0.75f, stiffness = Spring.StiffnessMediumLow)

    /** Playful transition for brand moments — a gentle bounce. */
    public fun <T> bouncySpring(): SpringSpec<T> =
        spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessLow)

    /** Per-index delay for the staggered list-entry animation. */
    public const val STAGGER_STEP_MILLIS: Int = 45
}
