package me.meeshy.sdk.model.scene

/**
 * Interpolation Catmull-Rom uniforme (mode `curve`) — miroir de `CatmullRomSmoother`.
 * Moins de 3 points : identité. Les extrémités sont conservées.
 */
object CatmullRomSmoother {
    const val SAMPLES_PER_SEGMENT: Int = 8

    fun smooth(points: List<StrokePoint>, samplesPerSegment: Int = SAMPLES_PER_SEGMENT): List<StrokePoint> =
        smooth(points, List(points.size) { 0.0 }, samplesPerSegment).map { it.point }

    /** Largeurs interpolées en lockstep avec la géométrie (mêmes t, mêmes points de contrôle). */
    fun smooth(
        points: List<StrokePoint>,
        widths: List<Double>,
        samplesPerSegment: Int = SAMPLES_PER_SEGMENT,
    ): List<StrokeWidthPoint> {
        val source = points.zip(widths) { p, w -> StrokeWidthPoint(p, w) }
        if (points.size < 3 || points.size != widths.size || samplesPerSegment < 1) return source
        val n = source.size
        val out = ArrayList<StrokeWidthPoint>(1 + (n - 1) * samplesPerSegment)
        out += source[0]
        for (i in 0 until n - 1) {
            val p0 = if (i == 0) source[i] else source[i - 1]
            val p1 = source[i]
            val p2 = source[i + 1]
            val p3 = if (i + 2 < n) source[i + 2] else source[i + 1]
            for (s in 1..samplesPerSegment) {
                val t = s.toDouble() / samplesPerSegment
                out += StrokeWidthPoint(
                    StrokePoint(
                        spline(p0.point.x, p1.point.x, p2.point.x, p3.point.x, t),
                        spline(p0.point.y, p1.point.y, p2.point.y, p3.point.y, t),
                    ),
                    spline(p0.width, p1.width, p2.width, p3.width, t),
                )
            }
        }
        return out
    }

    private fun spline(p0: Double, p1: Double, p2: Double, p3: Double, t: Double): Double {
        val t2 = t * t
        val t3 = t2 * t
        return 0.5 * (
            2 * p1 +
                (-p0 + p2) * t +
                (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                (-p0 + 3 * p1 - 3 * p2 + p3) * t3
            )
    }
}
