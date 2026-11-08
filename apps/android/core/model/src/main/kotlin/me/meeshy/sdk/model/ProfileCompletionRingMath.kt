package me.meeshy.sdk.model

/**
 * Arithmetique pure de l'anneau de completude du profil (miroir de `ProfileCompletionRing.swift`) :
 * progression bornee 0..1, pourcentage entier tronque (`Int(progress * 100)`), balayage en degres.
 */
object ProfileCompletionRingMath {

    fun clamp(progress: Float): Float = if (progress.isNaN()) 0f else progress.coerceIn(0f, 1f)

    fun percent(progress: Float): Int = (clamp(progress) * 100f).toInt()

    fun progressOf(percent: Int): Float = percent.coerceIn(0, 100) / 100f

    fun sweepDegrees(progress: Float): Float = 360f * clamp(progress)
}
