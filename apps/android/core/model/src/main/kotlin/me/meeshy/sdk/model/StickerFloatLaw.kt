package me.meeshy.sdk.model

import kotlin.math.PI
import kotlin.math.cos

/**
 * Le sticker FLOTTE (iOS `StickerFloatLaw`, #10630) : une ombre douce et un flottement lent
 * du conteneur. Réduire les animations fige le mouvement, jamais l'ombre.
 */
object StickerFloatLaw {
    const val LIFT_DP: Float = 4f
    const val HALF_PERIOD_SECONDS: Double = 2.1
    const val SHADOW_ALPHA: Float = 0.18f
    const val SHADOW_RADIUS_DP: Float = 8f
    const val SHADOW_OFFSET_Y_DP: Float = 6f

    /** Le décalage vertical d'un état levé ou posé ; toujours 0 sous Réduire les animations. */
    fun offsetYDp(isLifted: Boolean, reduceMotion: Boolean): Float =
        if (reduceMotion || !isLifted) 0f else -LIFT_DP

    /**
     * Le décalage vertical à [seconds] depuis l'apparition : va-et-vient en easeInOut entre
     * posé (0) et levé (-4 dp), de demi-période 2,1 s. Pur ; `null`/hors écran = [seconds] 0.
     */
    fun offsetYDp(seconds: Double, reduceMotion: Boolean): Float {
        if (reduceMotion || !seconds.isFinite() || seconds <= 0.0) return 0f
        val phase = (seconds % (2 * HALF_PERIOD_SECONDS)) / HALF_PERIOD_SECONDS
        val linear = if (phase <= 1.0) phase else 2.0 - phase
        val eased = (1 - cos(PI * linear)) / 2
        return (-LIFT_DP * eased).toFloat()
    }

    /** L'ombre reste, quel que soit le réglage de mouvement. */
    fun shadowAlpha(@Suppress("UNUSED_PARAMETER") reduceMotion: Boolean): Float = SHADOW_ALPHA
}
