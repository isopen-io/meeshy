package me.meeshy.sdk.model.audioedit

import kotlin.math.max
import kotlin.math.min

/** Un intervalle de la source, en secondes. */
public data class AudioTimeRange(val start: Double, val end: Double) {
    val duration: Double get() = end - start
}

/**
 * La description normalisée d'une édition, prête pour le moteur : les tranches de la source
 * à garder, plus la vitesse, le gain et les fondus. Tous les paramètres sont bornés, si
 * bien qu'une opération mal formée ne peut pas faire échouer le pipeline natif.
 */
public data class AudioEditPlan(
    val keptRanges: List<AudioTimeRange>,
    val speed: Double,
    val gain: Float,
    val fadeIn: Boolean,
    val fadeOut: Boolean,
) {
    /** Durée des tranches gardées, avant changement de vitesse. */
    val keptDuration: Double get() = keptRanges.sumOf { it.duration }

    /** Durée du fichier rendu. */
    val finalDuration: Double get() = keptDuration / speed

    /** Durée de chaque fondu pour ce rendu. */
    val fadeSeconds: Double get() = fadeSecondsFor(finalDuration)

    public companion object {
        public const val MIN_SPEED: Double = 0.25
        public const val MAX_SPEED: Double = 3.0
        public const val MAX_GAIN: Double = 4.0
        public const val MIN_SLICE: Double = 0.1
        public const val MIN_FADE: Double = 0.2
        public const val MAX_FADE: Double = 1.2

        public fun fadeSecondsFor(finalDuration: Double): Double =
            min(MAX_FADE, max(MIN_FADE, finalDuration / 3.0))

        /** Abaisse [operation] en plan ; [AudioEditError.ResultTooShort] si rien d'audible ne reste. */
        public fun lower(operation: AudioEditOperation, sourceDuration: Double): AudioEditPlan {
            val duration = sourceDuration.finiteOrZero().coerceAtLeast(0.0)
            val full = listOf(AudioTimeRange(0.0, duration))
            fun plan(
                ranges: List<AudioTimeRange> = full,
                speed: Double = 1.0,
                gain: Float = 1f,
                fadeIn: Boolean = false,
                fadeOut: Boolean = false,
            ) = AudioEditPlan(ranges, speed, gain, fadeIn, fadeOut)

            return when (operation) {
                AudioEditOperation.Original -> plan()
                is AudioEditOperation.Trim -> {
                    val lo = max(0.0, min(operation.start.finiteOrZero(), operation.end.finiteOrZero()))
                    val hi = min(duration, max(operation.start.finiteOrZero(), operation.end.finiteOrZero()))
                    if (hi - lo <= MIN_SLICE) throw AudioEditError.ResultTooShort
                    plan(ranges = listOf(AudioTimeRange(lo, hi)))
                }
                is AudioEditOperation.RemoveRange -> {
                    val lo = max(0.0, min(operation.start.finiteOrZero(), operation.end.finiteOrZero()))
                    val hi = min(duration, max(operation.start.finiteOrZero(), operation.end.finiteOrZero()))
                    val ranges = buildList {
                        if (lo > MIN_SLICE) add(AudioTimeRange(0.0, min(lo, duration)))
                        if (duration - hi > MIN_SLICE) add(AudioTimeRange(max(hi, 0.0), duration))
                    }
                    if (ranges.isEmpty()) throw AudioEditError.ResultTooShort
                    plan(ranges = ranges)
                }
                is AudioEditOperation.Fade -> plan(fadeIn = operation.fadeIn, fadeOut = operation.fadeOut)
                is AudioEditOperation.Speed ->
                    plan(speed = operation.rate.finiteOr(1.0).coerceIn(MIN_SPEED, MAX_SPEED))
                is AudioEditOperation.Gain ->
                    plan(gain = operation.multiplier.finiteOrZero().coerceIn(0.0, MAX_GAIN).toFloat())
            }
        }

        private fun Double.finiteOrZero(): Double = finiteOr(0.0)
        private fun Double.finiteOr(fallback: Double): Double = if (isFinite()) this else fallback
    }
}

/** Le gain du fondu à l'instant [time] d'un rendu de [finalDuration] secondes. */
public object AudioFadeEnvelope {
    public fun gainAt(time: Double, finalDuration: Double, fadeIn: Boolean, fadeOut: Boolean): Double {
        val fade = AudioEditPlan.fadeSecondsFor(finalDuration)
        var gain = 1.0
        if (fadeIn && time < fade) gain = min(gain, (time / fade).coerceIn(0.0, 1.0))
        if (fadeOut && finalDuration > fade && time > finalDuration - fade) {
            gain = min(gain, ((finalDuration - time) / fade).coerceIn(0.0, 1.0))
        }
        return gain
    }
}
