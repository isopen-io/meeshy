package me.meeshy.sdk.model.brand

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sin

/**
 * Les mathématiques des deux révélations de marque (iOS `RevealCircleShape` et
 * `LiquidRevealShape`), en valeurs pures.
 */
object RevealGeometry {

    /** Rayon du reveal circulaire : la diagonale du cadre fois la progression (0..1). */
    fun circleRadius(width: Float, height: Float, progress: Float): Float =
        hypot(width, height) * progress

    const val LIQUID_SEGMENTS: Int = 120

    /** Distance du foyer au coin le plus éloigné du cadre. */
    fun farthestCorner(focusX: Float, focusY: Float, width: Float, height: Float): Float =
        max(
            max(hypot(focusX, focusY), hypot(width - focusX, focusY)),
            max(hypot(focusX, height - focusY), hypot(width - focusX, height - focusY)),
        )

    /** Rayon nu du disque liquide : de [baseRadius] à la couverture totale quand la progression passe à 1. */
    fun liquidBareRadius(
        focusX: Float,
        focusY: Float,
        width: Float,
        height: Float,
        progress: Float,
        baseRadius: Float,
        amplitude: Float,
    ): Float {
        val maxRadius = farthestCorner(focusX, focusY, width, height) + amplitude + 2f
        return baseRadius + (maxRadius - baseRadius) * progress.coerceIn(0f, 1f)
    }

    /** Amplitude de la vague : enveloppée par sin(progress·π), nulle aux deux extrémités. */
    fun liquidWaveAmplitude(progress: Float, amplitude: Float): Float =
        amplitude * sin(progress.coerceIn(0f, 1f) * PI.toFloat())

    /** Point [index] (0..[LIQUID_SEGMENTS]) du contour ondulé. */
    fun liquidPoint(index: Int, focusX: Float, focusY: Float, bareRadius: Float, waveAmplitude: Float, frequency: Float, phase: Float): Pair<Float, Float> {
        val angle = index * (2.0 * PI / LIQUID_SEGMENTS)
        val r = bareRadius + waveAmplitude * sin(frequency * angle + phase).toFloat()
        return (focusX + r * cos(angle)).toFloat() to (focusY + r * sin(angle)).toFloat()
    }
}
