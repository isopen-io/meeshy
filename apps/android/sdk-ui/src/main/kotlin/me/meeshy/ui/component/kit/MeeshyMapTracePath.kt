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
 * La loi pure du chemin : ses courbes, sa longueur, la fraction de chaque point, son milieu et la position à une fraction.
 * Sous deux points, ou 24 dp de longueur à l'écran, rien n'est dessiné.
 */
public class MeeshyMapTracePath private constructor(
    public val isDrawable: Boolean,
    public val segments: List<MeeshyMapTraceSegment>,
    public val length: Float,
    public val fractions: List<Float>,
    public val midpoint: MeeshyMapTracePoint,
    private val samples: List<Sample>,
) {
    internal data class Sample(val point: MeeshyMapTracePoint, val at: Float)

    /** La position à [fraction] (0 à 1) de la longueur ; hors bornes, le bout le plus proche. */
    public fun at(fraction: Float): MeeshyMapTracePoint {
        if (samples.isEmpty()) return MeeshyMapTracePoint(0f, 0f)
        val target = fraction.coerceIn(0f, 1f) * length
        val next = samples.indexOfFirst { it.at >= target }
        if (next <= 0) return samples.first().point
        val a = samples[next - 1]
        val b = samples[next]
        val span = b.at - a.at
        val t = if (span == 0f) 0f else (target - a.at) / span
        return MeeshyMapTracePoint(a.point.x + (b.point.x - a.point.x) * t, a.point.y + (b.point.y - a.point.y) * t)
    }

    public companion object {
        public const val MIN_LENGTH_DP: Float = 24f
        private const val SAMPLES: Int = 16
        private val ORIGIN = MeeshyMapTracePoint(0f, 0f)
        private val NOTHING = MeeshyMapTracePath(false, emptyList(), 0f, emptyList(), ORIGIN, emptyList())

        private fun bezier(s: MeeshyMapTraceSegment, t: Float): MeeshyMapTracePoint {
            val u = 1f - t
            val a = u * u * u
            val b = 3f * u * u * t
            val c = 3f * u * t * t
            val d = t * t * t
            return MeeshyMapTracePoint(
                a * s.start.x + b * s.c1.x + c * s.c2.x + d * s.end.x,
                a * s.start.y + b * s.c1.y + c * s.c2.y + d * s.end.y,
            )
        }

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

        private fun sample(segments: List<MeeshyMapTraceSegment>): List<Sample> {
            val out = mutableListOf(Sample(segments.first().start, 0f))
            segments.forEach { segment ->
                repeat(SAMPLES) { step ->
                    val point = bezier(segment, (step + 1) / SAMPLES.toFloat())
                    val last = out.last()
                    out.add(Sample(point, last.at + hypot(point.x - last.point.x, point.y - last.point.y)))
                }
            }
            return out
        }

        public fun of(points: List<MeeshyMapTracePoint>, kind: MeeshyMapTraceKind, smoothing: Boolean = true): MeeshyMapTracePath {
            val picked = if (kind == MeeshyMapTraceKind.Link) listOfNotNull(points.firstOrNull(), points.lastOrNull()) else points
            val usable = picked.filter { it.x.isFinite() && it.y.isFinite() }
            if (usable.size < 2) return NOTHING
            val segments = if (smoothing && kind != MeeshyMapTraceKind.Link && usable.size > 2) smooth(usable) else straight(usable)
            val samples = sample(segments)
            val length = samples.last().at
            if (length < MIN_LENGTH_DP) return NOTHING
            val fractions = usable.indices.map { index -> if (index == 0) 0f else samples[index * SAMPLES].at / length }
            val path = MeeshyMapTracePath(true, segments, length, fractions, ORIGIN, samples)
            return MeeshyMapTracePath(true, segments, length, fractions, path.at(0.5f), samples)
        }
    }
}
