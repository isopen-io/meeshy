package me.meeshy.sdk.model.call.frames

import kotlin.math.PI
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * La pose d'un groupe d'ornement à un instant : son décalage (pixels de la toile des ornements), sa rotation
 * (radians, autour du centre de la toile) et son opacité. MUTABLE à dessein : l'hôte la réutilise d'une image à
 * l'autre, pour qu'aucune image n'alloue.
 */
public class CallFrameMotionPose {
    public var dx: Double = 0.0
    public var dy: Double = 0.0
    public var rotation: Double = 0.0
    public var alpha: Double = 1.0

    internal fun reset() {
        dx = 0.0
        dy = 0.0
        rotation = 0.0
        alpha = 1.0
    }
}

/**
 * **LES COURBES DES ORNEMENTS ANIMÉS** (#12683) — ce que les `CAAnimation` de iOS `CallFrameMotionAnimations`
 * jouent, échantillonné à l'instant `t` (secondes depuis la pose du cadre) : mêmes durées, mêmes valeurs clés,
 * même décalage de phase par groupe. Une fonction pure de `t` : la même image à la même seconde, partout.
 */
public object CallFrameMotionCurve {
    /** La durée de l'entrée d'un ornement `onAppear`. */
    public const val ENTRANCE_SECONDS: Double = 0.8

    private val TWINKLE = doubleArrayOf(1.0, 0.2, 1.0)
    private val BREATHE = doubleArrayOf(1.0, 0.55, 1.0)
    private val FLICKER = doubleArrayOf(1.0, 0.78, 0.95, 0.66, 1.0, 0.86, 1.0)
    private val BLINK = doubleArrayOf(1.0, 0.0)
    private val FLASH = doubleArrayOf(0.0, 0.0, 1.0, 0.25, 1.0, 0.0, 0.0)
    private val FLASH_TIMES = doubleArrayOf(0.0, 0.6, 0.64, 0.68, 0.72, 0.8, 1.0)
    private val JITTER_X = doubleArrayOf(0.0, 1.0, -0.6, 0.0, 0.3, 0.0)
    private val JITTER_ALPHA = doubleArrayOf(1.0, 0.55, 1.0, 0.3, 1.0, 1.0)
    private val SWING = doubleArrayOf(-1.0, 1.0, -1.0)
    private const val FLICKER_PERIOD = 1.7
    private const val BLINK_PERIOD = 1.2
    private const val FLASH_PERIOD = 4.5
    private const val JITTER_PERIOD = 0.9
    private const val SCROLL_PERIOD = 0.5

    /**
     * La pose du groupe [index] de [track] à l'instant [t], sur une toile de hauteur [height] et d'unité [unit].
     * Écrite dans [into] ; rien n'est alloué.
     */
    public fun sample(track: CallFrameMotionTrack, index: Int, t: Double, height: Double, unit: Double, into: CallFrameMotionPose) {
        into.reset()
        if (!track.repeats) {
            entrance(t, unit, into)
            return
        }
        val phase = index.toDouble() / max(1, track.partitions)
        loop(track.style, phase, max(0.0, t), height, unit, into)
    }

    private fun entrance(t: Double, unit: Double, into: CallFrameMotionPose) {
        val progress = min(1.0, max(0.0, t / ENTRANCE_SECONDS))
        val eased = 1 - (1 - progress) * (1 - progress)
        into.alpha = eased
        into.dy = unit * 0.04 * (1 - eased)
    }

    private fun loop(style: CallFrameMotionStyle, phase: Double, t: Double, height: Double, unit: Double, into: CallFrameMotionPose) {
        when (style) {
            is CallFrameMotionStyle.Fall -> into.dy = fraction(t, style.period, 0.0) * height
            is CallFrameMotionStyle.Rise -> into.dy = -fraction(t, style.period, 0.0) * height
            is CallFrameMotionStyle.Twinkle -> into.alpha = smooth(TWINKLE, null, fraction(t, style.period, phase))
            is CallFrameMotionStyle.Breathe -> into.alpha = smooth(BREATHE, null, fraction(t, style.period, phase))
            CallFrameMotionStyle.Flicker -> into.alpha = smooth(FLICKER, null, fraction(t, FLICKER_PERIOD, phase))
            CallFrameMotionStyle.Blink -> into.alpha = discrete(BLINK, fraction(t, BLINK_PERIOD, 0.0))
            CallFrameMotionStyle.Flash -> into.alpha = smooth(FLASH, FLASH_TIMES, fraction(t, FLASH_PERIOD, phase))
            CallFrameMotionStyle.Jitter -> {
                val u = fraction(t, JITTER_PERIOD, 0.0)
                into.dx = discrete(JITTER_X, u) * unit * 0.02
                into.alpha = discrete(JITTER_ALPHA, u)
            }
            CallFrameMotionStyle.Scroll -> into.dy = fraction(t, SCROLL_PERIOD, 0.0) * max(2.0, unit * 0.006)
            is CallFrameMotionStyle.Spin -> into.rotation = fraction(t, style.period, 0.0) * 2 * PI
            is CallFrameMotionStyle.Sway -> into.rotation = smooth(SWING, null, fraction(t, style.period, phase)) * style.radians
            is CallFrameMotionStyle.Drift -> into.dx = smooth(SWING, null, fraction(t, style.period, phase)) * unit * style.units
            is CallFrameMotionStyle.Bob -> into.dy = smooth(SWING, null, fraction(t, style.period, phase)) * unit * style.units
        }
    }

    /** La position (0…1) dans une boucle de [period], décalée de [phase] période — le `timeOffset` de Core Animation. */
    public fun fraction(t: Double, period: Double, phase: Double): Double {
        if (period <= 0) return 0.0
        val cycles = t / period + phase
        return cycles - floor(cycles)
    }

    /** Des valeurs clés jointes en douceur (ni à-coup ni dépassement), aux instants [times] ou également répartis. */
    private fun smooth(values: DoubleArray, times: DoubleArray?, u: Double): Double {
        val last = values.size - 1
        if (last <= 0) return values.firstOrNull() ?: 0.0
        var segment = 0
        while (segment < last - 1 && u >= keyTime(times, segment + 1, last)) segment++
        val start = keyTime(times, segment, last)
        val end = keyTime(times, segment + 1, last)
        val local = if (end > start) min(1.0, max(0.0, (u - start) / (end - start))) else 1.0
        val eased = local * local * (3 - 2 * local)
        return values[segment] + (values[segment + 1] - values[segment]) * eased
    }

    private fun keyTime(times: DoubleArray?, index: Int, last: Int): Double = times?.get(index) ?: index.toDouble() / last

    /** Des valeurs tenues chacune une part égale de la boucle (le mode `discrete` de Core Animation). */
    private fun discrete(values: DoubleArray, u: Double): Double =
        values[min(values.size - 1, floor(u * values.size).toInt())]
}
