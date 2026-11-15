package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryDrawingStroke
import kotlin.math.hypot

/**
 * Gomme par trait — miroir de `eraseStrokes(near:)` : tout trait dont un point RENDU passe
 * à `largeur/2 + 28` px design (inclus) d'un point de gomme disparaît. Ne crée rien.
 */
object StrokeEraserHitTest {
    const val ERASE_RADIUS: Double = 28.0

    fun reach(stroke: StoryDrawingStroke): Double = stroke.width / 2 + ERASE_RADIUS

    fun isHit(stroke: StoryDrawingStroke, erasePoints: List<StrokePoint>): Boolean {
        val reach = reach(stroke)
        return VariableWidthStrokeGeometry.renderPoints(stroke).any { sp ->
            erasePoints.any { ep -> hypot(sp.x - ep.x, sp.y - ep.y) <= reach }
        }
    }

    fun survivors(strokes: List<StoryDrawingStroke>, erasePoints: List<StrokePoint>): List<StoryDrawingStroke> =
        if (erasePoints.isEmpty()) strokes else strokes.filterNot { isHit(it, erasePoints) }
}
