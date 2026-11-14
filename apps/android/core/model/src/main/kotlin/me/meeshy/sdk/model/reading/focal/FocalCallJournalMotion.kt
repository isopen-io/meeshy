package me.meeshy.sdk.model.reading.focal

import me.meeshy.sdk.model.call.CallChromeStow

/**
 * A1.4 — le mouvement du journal déplié sous la bulle d'appel : il entre et sort en fondu glissé depuis la bulle, par
 * transformation + opacité seulement (la taille ne s'anime jamais). « Réduire les animations » le remplace par un fondu
 * court, sans glissement (iOS `BubbleCallJournalUnderCard` : `.opacity.combined(with: .move(edge: .top))`, `easeOut(0.15)`).
 */
object FocalCallJournalMotion {
    const val FADE_MILLIS: Int = 280
    private const val SLIDE_DP: Float = 12f

    fun fadeMillis(reduceMotion: Boolean): Int = if (reduceMotion) CallChromeStow.REDUCED_FADE_MILLIS else FADE_MILLIS

    /** Où le journal se tient quand il est caché : au-dessus de sa place, vers la bulle ; sans glissement quand on réduit. */
    fun hiddenOffsetDp(reduceMotion: Boolean): Float = if (reduceMotion) 0f else -SLIDE_DP
}
