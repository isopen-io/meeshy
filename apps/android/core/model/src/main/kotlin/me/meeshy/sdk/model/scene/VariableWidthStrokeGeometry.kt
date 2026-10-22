package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StrokeSmoothing
import kotlin.math.hypot
import kotlin.math.max

/** Disque de bouchon (ou trait d'un seul point), en espace design. */
data class StrokeCap(val center: StrokePoint, val radius: Double)

/**
 * Ruban triangle-strip (sommets gauche/droite alternés par point) + bouchons ronds —
 * miroir de `VariableWidthStrokeBuilder` / `StrokePathBuilder`. Sans projection.
 */
data class StrokeGeometry(val vertices: List<StrokePoint>, val caps: List<StrokeCap>)

object VariableWidthStrokeGeometry {
    private const val MIN_CAP_RADIUS = 0.5
    private const val MIN_TANGENT_LENGTH = 0.0001

    /** Lissage du trait (raw / curve / line) en transportant la largeur effective. */
    fun renderWidthPoints(stroke: StoryDrawingStroke): List<StrokeWidthPoint> {
        val points = stroke.points.map { StrokePoint(it.x, it.y) }
        val widths = stroke.points.map { StrokeWidthMapping.effectiveWidth(stroke, it.pressure) }
        return when (stroke.smoothing) {
            StrokeSmoothing.RAW -> points.zip(widths) { p, w -> StrokeWidthPoint(p, w) }
            StrokeSmoothing.CURVE -> CatmullRomSmoother.smooth(points, widths)
            StrokeSmoothing.LINE -> RamerDouglasPeucker.straighten(points, widths)
        }
    }

    /** Points de rendu (sans largeur) — ceux que teste la gomme. */
    fun renderPoints(stroke: StoryDrawingStroke): List<StrokePoint> =
        renderWidthPoints(stroke).map { it.point }

    fun geometry(stroke: StoryDrawingStroke): StrokeGeometry = tessellate(renderWidthPoints(stroke))

    fun tessellate(points: List<StrokeWidthPoint>): StrokeGeometry {
        if (points.isEmpty()) return StrokeGeometry(emptyList(), emptyList())
        val vertices = ArrayList<StrokePoint>(points.size * 2)
        points.indices.forEach { i ->
            val p = points[i].point
            val half = points[i].width / 2
            val prev = points[max(0, i - 1)].point
            val next = points[minOf(points.size - 1, i + 1)].point
            val dx = next.x - prev.x
            val dy = next.y - prev.y
            val len = max(hypot(dx, dy), MIN_TANGENT_LENGTH)
            val nx = -dy / len
            val ny = dx / len
            vertices += StrokePoint(p.x + nx * half, p.y + ny * half)
            vertices += StrokePoint(p.x - nx * half, p.y - ny * half)
        }
        val ends = if (points.size == 1) listOf(points.first()) else listOf(points.first(), points.last())
        return StrokeGeometry(vertices, ends.map { StrokeCap(it.point, max(MIN_CAP_RADIUS, it.width / 2)) })
    }
}
