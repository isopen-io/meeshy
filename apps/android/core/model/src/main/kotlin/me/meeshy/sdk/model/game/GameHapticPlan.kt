package me.meeshy.sdk.model.game

import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * Le motif traduit pour Android, en données : une composition de primitives (API 30+, si l'appareil
 * les sait toutes) ou une forme d'onde (minSdk 26). Le choix du moteur est dans `GameHaptics` ; le calcul
 * est ici, donc prouvé sans appareil.
 */
object GameHapticPlan {

    enum class Primitive { CLICK, TICK }

    /** Une primitive jouée [delayMillis] après la fin de la précédente (la première : après le début). */
    data class Step(val primitive: Primitive, val scale: Float, val delayMillis: Int)

    data class Waveform(val timings: LongArray, val amplitudes: IntArray) {
        override fun equals(other: Any?): Boolean =
            other is Waveform && timings.contentEquals(other.timings) && amplitudes.contentEquals(other.amplitudes)

        override fun hashCode(): Int = 31 * timings.contentHashCode() + amplitudes.contentHashCode()
    }

    /** Un toucher net (sharpness haute) est un CLICK, un toucher doux un TICK. */
    const val CLICK_SHARPNESS: Float = 0.6f

    /** La durée d'une primitive, retranchée de l'écart pour que les instants du motif tiennent. */
    const val PRIMITIVE_BUDGET_MILLIS: Int = 20

    /** La durée d'un toucher en forme d'onde. */
    const val WAVEFORM_TAP_MILLIS: Long = 20L

    fun steps(taps: List<GameHapticTap>): List<Step> {
        var cursor = 0
        return taps.sortedBy { it.timeSeconds }.map { tap ->
            val at = (tap.timeSeconds * 1000).roundToInt()
            val step = Step(
                primitive = if (tap.sharpness >= CLICK_SHARPNESS) Primitive.CLICK else Primitive.TICK,
                scale = tap.intensity.coerceIn(0f, 1f),
                delayMillis = max(0, at - cursor),
            )
            cursor = max(at, cursor) + PRIMITIVE_BUDGET_MILLIS
            step
        }
    }

    /** Silence, toucher, silence, toucher… (`VibrationEffect.createWaveform`, amplitudes 1–255). */
    fun waveform(taps: List<GameHapticTap>): Waveform? {
        if (taps.isEmpty()) return null
        val timings = ArrayList<Long>()
        val amplitudes = ArrayList<Int>()
        var cursor = 0L
        taps.sortedBy { it.timeSeconds }.forEach { tap ->
            val at = (tap.timeSeconds * 1000).roundToLong()
            timings += max(0L, at - cursor)
            amplitudes += 0
            timings += WAVEFORM_TAP_MILLIS
            amplitudes += (tap.intensity.coerceIn(0f, 1f) * 255).roundToInt().coerceIn(1, 255)
            cursor = max(at, cursor) + WAVEFORM_TAP_MILLIS
        }
        return Waveform(timings.toLongArray(), amplitudes.toIntArray())
    }
}
