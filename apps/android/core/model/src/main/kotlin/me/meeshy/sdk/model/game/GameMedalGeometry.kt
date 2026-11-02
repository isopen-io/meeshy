package me.meeshy.sdk.model.game

import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

data class GameMedalPoint(val x: Double, val y: Double)

/**
 * La géométrie pure d'une médaille (miroir de `GameMedalView.swift` et de `medal.ts`) : boîte de dessin
 * 100 x 112, sept perles de palier, arc de progression, ruban à partir de l'Or. Le dessin ne fait que
 * projeter ces valeurs.
 */
object GameMedalGeometry {
    const val PEARL_COUNT: Int = 7
    const val RIBBON_FROM_RANK: Int = 4
    const val CENTER_X: Double = 50.0
    const val CENTER_Y: Double = 52.0
    const val BEZEL_RADIUS: Double = 34.0
    const val ARC_RADIUS: Double = BEZEL_RADIUS + 7
    const val PEARL_RADIUS: Double = BEZEL_RADIUS + 1.5
    private const val PEARL_SPACING_DEGREES = 13.0
    private const val ARC_STEPS_PER_TURN = 96

    fun pearlCenters(): List<GameMedalPoint> = (0 until PEARL_COUNT).map { step ->
        val angle = (-90.0 + (step - 3) * PEARL_SPACING_DEGREES) * PI / 180.0
        GameMedalPoint(CENTER_X + PEARL_RADIUS * cos(angle), CENTER_Y + PEARL_RADIUS * sin(angle))
    }

    fun isPearlLit(index: Int, rank: Int): Boolean = index < min(max(rank, 0), PEARL_COUNT)

    fun hasRibbon(rank: Int): Boolean = rank >= RIBBON_FROM_RANK

    fun clampProgress(progress: Double): Double =
        if (!progress.isFinite()) 0.0 else min(max(progress, 0.0), 1.0)

    fun isArcComplete(progress: Double): Boolean = clampProgress(progress) >= 1.0

    /** Les sommets de l'arc partiel, de midi dans le sens horaire ; vide à 0, le cercle entier est tracé à part. */
    fun arcPoints(progress: Double): List<GameMedalPoint> {
        val p = clampProgress(progress)
        if (p <= 0.0) return emptyList()
        val steps = max(2, ceil(p * ARC_STEPS_PER_TURN).toInt())
        return (0..steps).map { step ->
            val angle = step.toDouble() / steps * p * 2 * PI - PI / 2
            GameMedalPoint(CENTER_X + ARC_RADIUS * cos(angle), CENTER_Y + ARC_RADIUS * sin(angle))
        }
    }

    /** Les pastilles du médaillon de collection, dans la boîte 72 x 72 du badge. */
    fun collectionDots(total: Int): List<GameMedalPoint> {
        val count = max(1, total)
        return (0 until count).map { step ->
            val angle = step.toDouble() / count * 2 * PI - PI / 2
            GameMedalPoint(36.0 + 18.0 * cos(angle), 36.0 + 18.0 * sin(angle))
        }
    }
}
