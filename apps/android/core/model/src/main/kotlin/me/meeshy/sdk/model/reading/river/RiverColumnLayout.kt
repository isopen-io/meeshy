package me.meeshy.sdk.model.reading.river

import kotlin.math.max
import kotlin.math.min

/**
 * Géométrie horizontale des couloirs — l'arithmétique PURE que la toile consomme, jamais l'inverse.
 * Miroir de `RiverColumnLayout.swift`. Le rail (la ligne de la branche) passe au CENTRE de son
 * couloir. [laneWidth] est un PARAMÈTRE (une peau étroite peut le baisser, jamais tronquer le texte).
 */
data class RiverColumnLayout(val laneWidth: Double, val gutter: Double, val laneCount: Int) {

    /** Largeur totale du contenu défilable : `laneCount` couloirs contigus. */
    val totalWidth: Double get() = max(0, laneCount) * laneWidth

    fun laneLeadingX(laneIndex: Int): Double = laneIndex * laneWidth

    fun railX(laneIndex: Int): Double = laneLeadingX(laneIndex) + laneWidth / 2

    /** Largeur utile de la bulle : le couloir moins la gouttière des deux côtés. */
    val bubbleContentWidth: Double get() = max(0.0, laneWidth - gutter * 2)

    /**
     * Décalage qui amène le rail du couloir [laneIndex] au centre d'un volet de largeur [paneWidth],
     * borné entre la rive (0) et le bord (`totalWidth − paneWidth`) ; zéro si tout tient.
     */
    fun horizontalOffset(centeringLane: Int, paneWidth: Double): Double {
        val overflow = totalWidth - paneWidth
        if (overflow <= 0) return 0.0
        return min(overflow, max(0.0, railX(centeringLane) - paneWidth / 2))
    }
}
