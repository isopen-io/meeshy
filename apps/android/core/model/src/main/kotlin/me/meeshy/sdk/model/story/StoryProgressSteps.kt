package me.meeshy.sdk.model.story

import kotlin.math.roundToInt

/**
 * Le pas de la barre de progression pour TalkBack : dix pour cent. [INTERIOR_STEPS] est le nombre de pas INTÉRIEURS que
 * `ProgressBarRangeInfo` attend (neuf points entre 0 et 100 % = dix intervalles), [snap] ramène une cible au cran.
 */
object StoryProgressSteps {
    const val INTERVALS = 10
    const val INTERIOR_STEPS = INTERVALS - 1

    fun snap(fraction: Float): Float = (fraction.coerceIn(0f, 1f) * INTERVALS).roundToInt() / INTERVALS.toFloat()

    fun percent(fraction: Float): Int = (snap(fraction) * 100f).roundToInt()
}
