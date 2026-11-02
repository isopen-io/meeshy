package me.meeshy.sdk.model.fullscreen

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Ce que le cadran du vocal plein écran décide, sans vue (miroir de `AudioFullscreenDialRule`,
 * #10568) : où le doigt vise, comment le curseur le suit, comment l'onde devient 72 barres.
 */
public object AudioDialGeometry {

    /** Épaisseur de l'anneau autour du portrait ; c'est aussi la bande où le doigt saisit le curseur. */
    public const val BAND: Float = 40f

    /** Écart entre le portrait et le pied des barres. */
    public const val GAP: Float = 6f

    /** Longueur d'une barre à pleine amplitude. */
    public const val BAR_LENGTH: Float = 24f

    public const val BAR_COUNT: Int = 72

    /** Pas d'un ajustement TalkBack. */
    public const val ADJUST_STEP: Double = 0.05

    /** Fraction de l'écoute visée par le point (x, y) : angle depuis midi, sens horaire (3 h = 0,25). */
    public fun fraction(x: Float, y: Float, width: Float, height: Float): Double {
        val dx = (x - width / 2f).toDouble()
        val dy = (y - height / 2f).toDouble()
        if (dx == 0.0 && dy == 0.0) return 0.0
        val turn = atan2(dx, -dy) / (2 * PI)
        return if (turn < 0) turn + 1 else turn
    }

    /** Le curseur ne saute jamais par-dessus midi : il bute sur la fin (ou le début). */
    public fun scrubbed(previous: Double, raw: Double): Double = when {
        previous > 0.75 && raw < 0.25 -> 1.0
        previous < 0.25 && raw > 0.75 -> 0.0
        else -> raw
    }

    /** Le point touche-t-il l'anneau saisissable (hors portrait, dans la bande) ? */
    public fun isInRing(x: Float, y: Float, side: Float, portraitDiameter: Float): Boolean {
        val dx = x - side / 2f
        val dy = y - side / 2f
        val distance = kotlin.math.sqrt(dx * dx + dy * dy)
        return distance >= portraitDiameter / 2f && distance <= side / 2f
    }

    /** Ramène [samples] à [count] barres : le pic de chaque paquet, pour qu'une attaque brève reste visible. */
    public fun resample(samples: List<Float>, count: Int = BAR_COUNT): List<Float> {
        if (samples.isEmpty() || count <= 0) return emptyList()
        if (samples.size == count) return samples
        return List(count) { bar ->
            val start = bar * samples.size / count
            val end = max(start + 1, (bar + 1) * samples.size / count)
            samples.subList(start, min(end, samples.size)).maxOrNull() ?: 0f
        }
    }

    /** Silhouette de repli déterministe par index quand l'analyse n'a rien rendu. */
    public fun fallbackHeight(index: Int): Float {
        val seed = (index * 7 + 3).toDouble()
        val value = 0.2 + abs(sin(seed) * 0.4 + cos(seed * 0.5) * 0.3)
        return min(1.0, value).toFloat()
    }

    /** Souffle d'une barre pendant l'écoute : onde qui tourne, plus ample près du curseur. 1 à l'arrêt. */
    public fun pulse(bar: Int, progress: Double, timeSeconds: Double, isPlaying: Boolean): Float {
        if (!isPlaying) return 1f
        val position = bar.toDouble() / BAR_COUNT
        val distance = min(abs(position - progress), 1 - abs(position - progress))
        val nearCursor = max(0.0, 1 - distance * 8)
        val wave = sin(timeSeconds * 5 + bar * 0.55)
        return (1 + wave * (0.12 + 0.22 * nearCursor)).toFloat()
    }

    /** Longueur peinte d'une barre : plancher 3, plafond 1,25 fois la longueur maximale. */
    public fun barLength(sample: Float, pulse: Float): Float =
        max(3f, min(BAR_LENGTH * 1.25f, sample * BAR_LENGTH * pulse))

    /** Fraction après un pas TalkBack, bornée à [0, 1]. */
    public fun adjusted(progress: Double, increment: Boolean): Double =
        if (increment) min(1.0, progress + ADJUST_STEP) else max(0.0, progress - ADJUST_STEP)

    /** Valeur vocalisée : « 42 % ». */
    public fun percent(progress: Double): Int = (progress.coerceIn(0.0, 1.0) * 100).let { Math.round(it).toInt() }
}
