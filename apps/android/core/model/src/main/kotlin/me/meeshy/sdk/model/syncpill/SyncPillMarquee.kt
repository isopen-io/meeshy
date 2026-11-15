package me.meeshy.sdk.model.syncpill

import kotlin.math.max

/**
 * La décision pure de défilement du texte trop long de la pastille (miroir d'iOS `SyncPillMarquee`). La mesure porte
 * TOUJOURS sur le libellé seul, jamais sur le texte composé avec des points de suspension animés (qui oscilleraient).
 * Tout est en dp.
 */
object SyncPillMarquee {
    const val POINTS_PER_SECOND: Double = 40.0

    /** L'espace laissé derrière la fin du texte avant qu'il ne reparte du bord. */
    const val GAP: Float = 24f

    /** Le texte déborde STRICTEMENT : l'égalité exacte ne défile pas (un arrondi d'un pixel ne déclenche rien). */
    fun shouldScroll(textWidth: Float, availableWidth: Float): Boolean = textWidth > availableWidth

    /** Durée d'un cycle, proportionnelle à la largeur ; plancher à 1 s pour qu'un texte à peine trop long reste perceptible. */
    fun scrollDuration(textWidth: Float): Double = max(1.0, textWidth / POINTS_PER_SECOND)

    /**
     * Le décalage horizontal à l'instant [elapsedSeconds] : une loi du TEMPS ÉCOULÉ, pas un état incrémenté. La première
     * passe va du repos jusqu'à la sortie complète ; les suivantes repartent du bord. Figer [elapsedSeconds] est la pause.
     */
    fun offset(elapsedSeconds: Double, textWidth: Float, availableWidth: Float): Float {
        if (elapsedSeconds <= 0) return 0f
        val travelled = (POINTS_PER_SECOND * elapsedSeconds).toFloat()
        val firstPass = textWidth + GAP
        if (travelled <= firstPass) return -travelled
        val lap = availableWidth + firstPass
        val intoLap = (travelled - firstPass) % lap
        return availableWidth - intoLap
    }
}
