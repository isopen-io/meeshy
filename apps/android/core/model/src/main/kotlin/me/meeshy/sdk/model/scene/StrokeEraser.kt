package me.meeshy.sdk.model.scene

import kotlin.math.hypot
import me.meeshy.sdk.model.StoryDrawingStroke

/**
 * La gomme par trait : tout trait frôlé par le geste disparaît (miroir de `eraseStrokes(near:)` d'iOS). Le rayon est en
 * pixels design, le repère des traits, donc le geste est identique quelle que soit la taille de la scène rendue.
 */
object StrokeEraser {
    const val ERASE_RADIUS_DESIGN: Double = 28.0

    /** Les traits qui survivent au geste [erasePoints] ; la même liste (identité) si rien n'est touché. */
    fun survivors(strokes: List<StoryDrawingStroke>, erasePoints: List<StrokePoint>): List<StoryDrawingStroke> {
        if (erasePoints.isEmpty()) return strokes
        val kept = strokes.filterNot { touched(it, erasePoints) }
        return if (kept.size == strokes.size) strokes else kept
    }

    private fun touched(stroke: StoryDrawingStroke, erasePoints: List<StrokePoint>): Boolean {
        val reach = stroke.width / 2 + ERASE_RADIUS_DESIGN
        val path = VariableWidthStrokeGeometry.renderPoints(stroke)
        return erasePoints.any { e ->
            path.zipWithNext().any { (a, b) -> distanceToSegment(e, a, b) <= reach } ||
                path.singleOrNull()?.let { hypot(it.x - e.x, it.y - e.y) <= reach } == true
        }
    }

    private fun distanceToSegment(p: StrokePoint, a: StrokePoint, b: StrokePoint): Double {
        val dx = b.x - a.x
        val dy = b.y - a.y
        val lengthSquared = dx * dx + dy * dy
        val t = if (lengthSquared == 0.0) 0.0 else (((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared).coerceIn(0.0, 1.0)
        return hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }
}
