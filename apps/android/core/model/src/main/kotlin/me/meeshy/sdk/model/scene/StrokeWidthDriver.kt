package me.meeshy.sdk.model.scene

import kotlin.math.hypot

/** Point en espace design (1080×1920). */
data class StrokePoint(val x: Double, val y: Double)

/** Point de rendu porteur de sa largeur effective (pixels design). */
data class StrokeWidthPoint(val point: StrokePoint, val width: Double)

/**
 * Driver de largeur normalisé [0,1] par point (haut = épais) — miroir de
 * `StrokeWidthDriver.swift` et de `StrokeCaptureLayer.fingerPressures`.
 */
object StrokeWidthDriver {
    const val NEUTRAL: Double = 0.5
    const val DESIGN_V_MAX: Double = 4000.0
    const val FINGER_WINDOW: Int = 5
    const val PENCIL_SPREAD_THRESHOLD: Double = 0.05

    fun velocity(previous: StrokePoint?, current: StrokePoint, dt: Double): Double? {
        if (previous == null || dt <= 0.0) return null
        return hypot(current.x - previous.x, current.y - previous.y) / dt
    }

    fun movingAverage(values: List<Double>, window: Int): List<Double> {
        if (window <= 1 || values.size <= 1) return values
        val half = window / 2
        return values.indices.map { i ->
            val lo = maxOf(0, i - half)
            val hi = minOf(values.size - 1, i + half)
            values.subList(lo, hi + 1).sum() / (hi - lo + 1)
        }
    }

    fun normalize(velocity: Double, vMax: Double): Double =
        if (vMax <= 0.0) 0.0 else clamp01(velocity / vMax)

    fun pencilDriver(force: Double, maxForce: Double): Double =
        if (maxForce <= 0.0) NEUTRAL else clamp01(force / maxForce)

    fun fingerDriver(normalizedSmoothedVelocity: Double): Double =
        clamp01(1.0 - normalizedSmoothedVelocity)

    /** `dts[i]` = Δt entre les points i et i+1 (donc `points.size - 1` deltas). */
    fun fingerPressures(points: List<StrokePoint>, dts: List<Double>): List<Double> {
        val n = points.size
        if (n <= 1 || dts.size != n - 1) return List(n) { NEUTRAL }
        val raw = listOf(0.0) + (1 until n).map { velocity(points[it - 1], points[it], dts[it - 1]) ?: 0.0 }
        return movingAverage(raw, FINGER_WINDOW).mapIndexed { i, v ->
            if (i == 0) NEUTRAL else fingerDriver(normalize(v, DESIGN_V_MAX))
        }
    }

    /** Stylet si la force VARIE (étendue > 0,05) sur le trait ; sinon doigt (vitesse). */
    fun pressures(points: List<StrokePoint>, dts: List<Double>, forces: List<Double>): List<Double> {
        val maxForce = forces.maxOrNull() ?: 0.0
        val spread = maxForce - (forces.minOrNull() ?: 0.0)
        val usesPencil = maxForce > 0.0 && spread > PENCIL_SPREAD_THRESHOLD
        return if (usesPencil) forces.map { pencilDriver(it, maxForce) } else fingerPressures(points, dts)
    }

    private fun clamp01(x: Double): Double = minOf(1.0, maxOf(0.0, x))
}
