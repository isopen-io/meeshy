package me.meeshy.sdk.model.accessibility

import kotlinx.serialization.Serializable

/**
 * Reglages d'accessibilite que l'APP ajoute au-dessus de ceux du systeme (iOS `MeeshyAccessibilitySettings`).
 * [reduceMotion] : l'app se comporte comme si « Reduire les animations » etait actif, meme si le systeme ne l'est pas.
 */
@Serializable
data class AccessibilitySettings(val reduceMotion: Boolean = false) {
    companion object {
        val DEFAULTS = AccessibilitySettings()
    }
}

/** Miroir de `MeeshyMotion.shouldReduce(system:userForced:)` (Accessibility.swift). */
object ReduceMotionLaw {
    /** L'override applicatif ne peut qu'AJOUTER de la reduction : il ne rend jamais un mouvement que le systeme supprime. */
    fun shouldReduce(system: Boolean, userForced: Boolean): Boolean = system || userForced

    /** Android n'a pas de bascule dediee : « reduire » = echelle d'animation systeme a zero. */
    fun systemReduces(animatorScale: Float): Boolean = animatorScale == 0f
}

/** Miroir de `RestingWaveform` (ReduceMotion.swift) : forme d'onde immobile, variee et deterministe. */
object RestingWaveform {
    private val RATIOS = floatArrayOf(0.30f, 0.72f, 0.45f, 1.00f, 0.38f, 0.86f, 0.55f)

    fun ratio(index: Int): Float = RATIOS[Math.abs(index % RATIOS.size)]

    fun height(index: Int, minHeight: Float, maxHeight: Float): Float =
        minHeight + (maxHeight - minHeight) * ratio(index)
}

/**
 * Specs pures des micro-animations de `ViewModifiers.swift`, conformes a Reduce Motion : l'etat final est
 * immediat, sans rebond, flottement ni echelle.
 */
object MotionSpecs {
    const val PRESSABLE_SCALE = 0.93f
    const val BOUNCE_ON_TAP_SCALE = 0.92f
    const val BOUNCE_ON_FOCUS_SCALE = 1.02f
    const val BOUNCE_ON_APPEAR_FROM = 0.5f
    const val STAGGER_STEP_MILLIS = 50
    const val STAGGER_OFFSET_DP = 20f
    const val STAGGER_FROM_SCALE = 0.95f
    const val FLOATING_RANGE_DP = 15f
    const val FLOATING_PERIOD_MILLIS = 4000
    const val PULSE_INTENSITY = 0.04f
    const val PULSE_PERIOD_MILLIS = 1800
    private const val FLOATING_VERTICAL_RATIO = 0.7f

    data class AppearState(val alpha: Float, val offsetDp: Float, val scale: Float, val delayMillis: Int)

    private val SETTLED = AppearState(alpha = 1f, offsetDp = 0f, scale = 1f, delayMillis = 0)

    fun pressScale(pressed: Boolean, target: Float, reduce: Boolean): Float =
        if (pressed && !reduce) target else 1f

    fun staggeredAppear(index: Int, visible: Boolean, reduce: Boolean): AppearState = when {
        reduce -> SETTLED
        visible -> SETTLED.copy(delayMillis = index.coerceAtLeast(0) * STAGGER_STEP_MILLIS)
        else -> AppearState(0f, STAGGER_OFFSET_DP, STAGGER_FROM_SCALE, index.coerceAtLeast(0) * STAGGER_STEP_MILLIS)
    }

    fun bounceOnAppear(visible: Boolean, reduce: Boolean): AppearState = when {
        reduce || visible -> SETTLED
        else -> AppearState(alpha = 0f, offsetDp = 0f, scale = BOUNCE_ON_APPEAR_FROM, delayMillis = 0)
    }

    fun floatingActive(reduce: Boolean): Boolean = !reduce

    fun pulseActive(reduce: Boolean): Boolean = !reduce

    fun pulseScale(pulsing: Boolean, intensity: Float): Float = if (pulsing) 1f + intensity else 1f

    fun floatingOffsetDp(floating: Boolean, range: Float): Pair<Float, Float> =
        if (floating) range to -range * FLOATING_VERTICAL_RATIO else -range to range * FLOATING_VERTICAL_RATIO
}
