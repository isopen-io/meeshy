package me.meeshy.sdk.model.scene

import kotlin.math.abs
import kotlin.math.hypot

/**
 * Simplification Ramer-Douglas-Peucker (mode `line`) — miroir de `RamerDouglasPeucker`.
 * Extrémités toujours conservées ; tolérance 0 = identité.
 */
object RamerDouglasPeucker {
    const val TOLERANCE: Double = 8.0

    fun straighten(points: List<StrokePoint>, tolerance: Double = TOLERANCE): List<StrokePoint> =
        keptIndices(points, tolerance).map { points[it] }

    /** Chaque point conservé garde sa largeur source. */
    fun straighten(
        points: List<StrokePoint>,
        widths: List<Double>,
        tolerance: Double = TOLERANCE,
    ): List<StrokeWidthPoint> {
        if (points.size != widths.size) return points.zip(widths) { p, w -> StrokeWidthPoint(p, w) }
        return keptIndices(points, tolerance).map { StrokeWidthPoint(points[it], widths[it]) }
    }

    private fun keptIndices(points: List<StrokePoint>, tolerance: Double): List<Int> {
        val all = points.indices.toList()
        if (points.size <= 2 || tolerance <= 0.0) return all
        return simplify(points, all, tolerance)
    }

    private fun simplify(points: List<StrokePoint>, indices: List<Int>, tolerance: Double): List<Int> {
        val n = indices.size
        if (n <= 2) return indices
        val first = points[indices.first()]
        val last = points[indices.last()]
        var maxDistance = 0.0
        var maxIndex = 0
        for (i in 1 until n - 1) {
            val d = perpendicularDistance(points[indices[i]], first, last)
            if (d > maxDistance) {
                maxDistance = d
                maxIndex = i
            }
        }
        if (maxDistance <= tolerance) return listOf(indices.first(), indices.last())
        val left = simplify(points, indices.subList(0, maxIndex + 1), tolerance)
        val right = simplify(points, indices.subList(maxIndex, n), tolerance)
        return left + right.drop(1)
    }

    private fun perpendicularDistance(p: StrokePoint, a: StrokePoint, b: StrokePoint): Double {
        val dx = b.x - a.x
        val dy = b.y - a.y
        if (dx == 0.0 && dy == 0.0) return hypot(p.x - a.x, p.y - a.y)
        return abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / hypot(dx, dy)
    }
}
