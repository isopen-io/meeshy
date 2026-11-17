package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import kotlin.math.hypot

public enum class MeeshyMapTraceKind { Route, Link, History }

public enum class MeeshyMapTraceWeight { Regular, Large }

/** Un point d'écran, en dp, déjà projeté par l'hôte. */
@Immutable
public data class MeeshyMapTracePoint(val x: Float, val y: Float)

/** Une courbe de Bézier cubique ; une droite a ses poignées sur ses bouts. */
@Immutable
public data class MeeshyMapTraceSegment(
    val start: MeeshyMapTracePoint,
    val c1: MeeshyMapTracePoint,
    val c2: MeeshyMapTracePoint,
    val end: MeeshyMapTracePoint,
)

/**
 * La loi pure du chemin : ses courbes (pour le dessin), et, mesurées sur les seuls points REÇUS comme sur iOS, sa longueur,
 * la fraction de chaque point reçu, son milieu et la position à une fraction. Le tracé commence sous le premier point et finit
 * sous le dernier : aucun point n'est inventé. `Link` ne lit que le premier et le dernier point lisibles. Sous deux points, ou
 * 24 dp de longueur à l'écran, rien n'est dessiné.
 */
public class MeeshyMapTracePath private constructor(
    public val isDrawable: Boolean,
    public val segments: List<MeeshyMapTraceSegment>,
    public val length: Float,
    public val fractions: List<Float>,
    public val midpoint: MeeshyMapTracePoint,
    private val points: List<MeeshyMapTracePoint>,
    private val cumulative: List<Float>,
    private val receivedIndexes: List<Int>,
) {
    /** La part du chemin parcourue jusqu'au point REÇU d'indice [index] ; `null` pour un point que le tracé ne passe pas. */
    public fun fraction(index: Int): Float? {
        val drawn = receivedIndexes.indexOf(index)
        if (drawn < 0) return null
        return fractions[drawn]
    }

    /** La position à [fraction] (0 à 1) de la longueur, sur les points reçus ; hors bornes, le bout le plus proche. */
    public fun at(fraction: Float): MeeshyMapTracePoint {
        if (points.isEmpty()) return ORIGIN
        if (length <= 0f) return points.first()
        val target = (if (fraction.isFinite()) fraction.coerceIn(0f, 1f) else 0f) * length
        val segment = (1 until points.size).firstOrNull { cumulative[it] >= target } ?: points.lastIndex
        val span = cumulative[segment] - cumulative[segment - 1]
        if (span <= 0f) return points[segment]
        val t = (target - cumulative[segment - 1]) / span
        val a = points[segment - 1]
        val b = points[segment]
        return MeeshyMapTracePoint(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
    }

    public companion object {
        public const val MIN_LENGTH_DP: Float = 24f
        private val ORIGIN = MeeshyMapTracePoint(0f, 0f)

        /** Catmull-Rom converti en cubiques : le chemin lissé passe par chaque point. */
        private fun smooth(points: List<MeeshyMapTracePoint>): List<MeeshyMapTraceSegment> =
            points.dropLast(1).mapIndexed { index, start ->
                val before = points[maxOf(index - 1, 0)]
                val end = points[index + 1]
                val after = points[minOf(index + 2, points.lastIndex)]
                MeeshyMapTraceSegment(
                    start = start,
                    c1 = MeeshyMapTracePoint(start.x + (end.x - before.x) / 6f, start.y + (end.y - before.y) / 6f),
                    c2 = MeeshyMapTracePoint(end.x - (after.x - start.x) / 6f, end.y - (after.y - start.y) / 6f),
                    end = end,
                )
            }

        private fun straight(points: List<MeeshyMapTracePoint>): List<MeeshyMapTraceSegment> =
            points.dropLast(1).mapIndexed { index, start -> MeeshyMapTraceSegment(start, start, points[index + 1], points[index + 1]) }

        public fun of(points: List<MeeshyMapTracePoint>, kind: MeeshyMapTraceKind, smoothing: Boolean = true): MeeshyMapTracePath {
            val usable = points.indices.filter { points[it].x.isFinite() && points[it].y.isFinite() }
            val received = if (kind == MeeshyMapTraceKind.Link && usable.size >= 2) listOf(usable.first(), usable.last()) else usable
            val drawn = received.map { points[it] }
            val cumulative = drawn.indices.runningFold(0f) { total, index ->
                if (index == 0) total else total + hypot(drawn[index].x - drawn[index - 1].x, drawn[index].y - drawn[index - 1].y)
            }.drop(1)
            val length = cumulative.lastOrNull() ?: 0f
            val fractions = cumulative.mapIndexed { index, at -> if (length > 0f) at / length else if (index == 0) 0f else 1f }
            val segments = when {
                drawn.size < 2 -> emptyList()
                smoothing && kind != MeeshyMapTraceKind.Link && drawn.size > 2 -> smooth(drawn)
                else -> straight(drawn)
            }
            val isDrawable = drawn.size >= 2 && length >= MIN_LENGTH_DP
            val path = MeeshyMapTracePath(isDrawable, segments, length, fractions, ORIGIN, drawn, cumulative, received)
            return MeeshyMapTracePath(isDrawable, segments, length, fractions, path.at(0.5f), drawn, cumulative, received)
        }
    }
}
