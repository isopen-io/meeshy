package me.meeshy.sdk.model

import kotlin.math.abs

/**
 * Où un objet NEUF se pose sur la scène (miroir de `StoryObjectPlacement.swift`, #4939).
 *
 * Sur une scène vide, le premier objet reste au centre ; les suivants cascadent
 * en diagonale par pas de [STEP], 12 rangs au plus, et la cascade revient vers
 * le haut-gauche plutôt que de sortir du cadre. Elle ne met rien en page : elle
 * décide seulement du POINT DE DÉPART, et seulement quand le centre est déjà pris.
 */
object StoryObjectPlacement {

    /** Position normalisée (0..1) dans le repère de la scène. */
    data class Point(val x: Double, val y: Double)

    val CENTER: Point = Point(0.5, 0.5)

    /** Pas de la cascade, en unités de scène. */
    const val STEP: Double = 0.06

    /** Marge que la cascade ne franchit pas. */
    const val MARGIN: Double = 0.18

    /** Deux positions sont « au même endroit » en deçà de cette distance (moitié du pas). */
    const val TOLERANCE: Double = STEP / 2

    private const val MAX_RANK = 12

    /** Le point où poser un objet neuf, en évitant [occupied] (les objets POSÉS, jamais un fond). */
    fun next(occupied: List<Point>): Point {
        var candidate = CENTER
        var rank = 0
        while (rank < MAX_RANK && occupied.any { isNear(it, candidate) }) {
            rank += 1
            val delta = STEP * rank
            candidate = Point(CENTER.x + delta, CENTER.y + delta)
            if (candidate.x > 1 - MARGIN || candidate.y > 1 - MARGIN) {
                val back = STEP * (rank - MAX_RANK / 2)
                candidate = Point(CENTER.x - back, CENTER.y - back)
            }
        }
        return Point(
            candidate.x.coerceIn(MARGIN, 1 - MARGIN),
            candidate.y.coerceIn(MARGIN, 1 - MARGIN),
        )
    }

    private fun isNear(a: Point, b: Point): Boolean = abs(a.x - b.x) < TOLERANCE && abs(a.y - b.y) < TOLERANCE
}
