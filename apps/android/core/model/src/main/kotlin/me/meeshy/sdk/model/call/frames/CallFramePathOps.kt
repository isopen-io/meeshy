package me.meeshy.sdk.model.call.frames

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * UN TRACÉ COMME DONNÉE — ce que les peintres de cadre (`frame-paint-*.ts`, `CallFrameRenderer+*.swift`)
 * posent sur un `Path`. Le tracé est calculé ici, en Kotlin pur et prouvé sur la JVM ; le canevas
 * Android n'a plus qu'à le rejouer. Repère : y vers le bas, angles en radians, comme le canevas web.
 */
public sealed interface CallFramePathOp {
    public data class MoveTo(val x: Double, val y: Double) : CallFramePathOp
    public data class LineTo(val x: Double, val y: Double) : CallFramePathOp
    public data class QuadTo(val cx: Double, val cy: Double, val x: Double, val y: Double) : CallFramePathOp
    public data class CubicTo(
        val c1x: Double,
        val c1y: Double,
        val c2x: Double,
        val c2y: Double,
        val x: Double,
        val y: Double,
    ) : CallFramePathOp

    /** `arc` du canevas : de [start] à [end] (radians, +x vers +y), à rebours si [anticlockwise]. */
    public data class Arc(
        val cx: Double,
        val cy: Double,
        val radius: Double,
        val start: Double,
        val end: Double,
        val anticlockwise: Boolean,
    ) : CallFramePathOp {
        /** Le balayage signé en radians, tel que le canevas le calcule (positif = sens horaire à l'écran). */
        public val sweep: Double
            get() = if (anticlockwise) {
                val delta = start - end
                if (delta >= TAU) -TAU else -positiveModulo(delta)
            } else {
                val delta = end - start
                if (delta >= TAU) TAU else positiveModulo(delta)
            }
    }

    public data class AddRect(val rect: CallFrameRect) : CallFramePathOp
    public data class AddRoundRect(val rect: CallFrameRect, val radius: Double) : CallFramePathOp
    public data class AddOval(val rect: CallFrameRect) : CallFramePathOp
    public data object Close : CallFramePathOp

    public companion object {
        public const val TAU: Double = 2 * PI

        internal fun positiveModulo(value: Double): Double {
            val rest = value % TAU
            return if (rest < 0) rest + TAU else rest
        }
    }
}

/** Une rotation autour de l'origine suivie d'une translation : le repère d'une pièce posée (confetti, feuille). */
public data class CallFrameTurn(val translateX: Double, val translateY: Double, val angle: Double)

/** Construit un tracé ; avec un [turn], les points sont posés dans le repère tourné de la pièce. */
public class CallFramePathBuilder(private val turn: CallFrameTurn? = null) {
    private val ops = mutableListOf<CallFramePathOp>()

    private fun px(x: Double, y: Double): Double =
        turn?.let { it.translateX + cos(it.angle) * x - sin(it.angle) * y } ?: x

    private fun py(x: Double, y: Double): Double =
        turn?.let { it.translateY + sin(it.angle) * x + cos(it.angle) * y } ?: y

    public fun moveTo(x: Double, y: Double): CallFramePathBuilder = apply {
        ops += CallFramePathOp.MoveTo(px(x, y), py(x, y))
    }

    public fun lineTo(x: Double, y: Double): CallFramePathBuilder = apply {
        ops += CallFramePathOp.LineTo(px(x, y), py(x, y))
    }

    public fun quadTo(cx: Double, cy: Double, x: Double, y: Double): CallFramePathBuilder = apply {
        ops += CallFramePathOp.QuadTo(px(cx, cy), py(cx, cy), px(x, y), py(x, y))
    }

    public fun cubicTo(c1x: Double, c1y: Double, c2x: Double, c2y: Double, x: Double, y: Double): CallFramePathBuilder =
        apply {
            ops += CallFramePathOp.CubicTo(px(c1x, c1y), py(c1x, c1y), px(c2x, c2y), py(c2x, c2y), px(x, y), py(x, y))
        }

    public fun arc(
        x: Double,
        y: Double,
        radius: Double,
        start: Double,
        end: Double,
        anticlockwise: Boolean = false,
    ): CallFramePathBuilder = apply {
        check(turn == null) { "un arc ne se pose pas dans un repère tourné" }
        ops += CallFramePathOp.Arc(x, y, max(0.0, radius), start, end, anticlockwise)
    }

    public fun addCircle(x: Double, y: Double, radius: Double): CallFramePathBuilder = apply {
        if (radius <= 0) return@apply
        check(turn == null) { "un cercle ne se pose pas dans un repère tourné" }
        ops += CallFramePathOp.AddOval(CallFrameRect(x - radius, y - radius, radius * 2, radius * 2))
    }

    public fun addOval(rect: CallFrameRect): CallFramePathBuilder = apply {
        check(turn == null) { "un ovale ne se pose pas dans un repère tourné" }
        ops += CallFramePathOp.AddOval(rect)
    }

    /** Un rectangle ; dans un repère tourné, il devient un polygone fermé. */
    public fun addRect(rect: CallFrameRect): CallFramePathBuilder = apply {
        if (turn == null) {
            ops += CallFramePathOp.AddRect(rect)
            return@apply
        }
        moveTo(rect.minX, rect.minY)
        lineTo(rect.maxX, rect.minY)
        lineTo(rect.maxX, rect.maxY)
        lineTo(rect.minX, rect.maxY)
        close()
    }

    /** Un rectangle arrondi dont le rayon ne dépasse jamais la moitié d'un côté (`addRoundedRect` d'iOS). */
    public fun addRoundRect(rect: CallFrameRect, radius: Double): CallFramePathBuilder = apply {
        if (rect.width <= 0 || rect.height <= 0) return@apply
        check(turn == null) { "un rectangle arrondi ne se pose pas dans un repère tourné" }
        val corner = max(0.0, min(radius, min(rect.width / 2, rect.height / 2)))
        ops += if (corner > 0) CallFramePathOp.AddRoundRect(rect, corner) else CallFramePathOp.AddRect(rect)
    }

    public fun close(): CallFramePathBuilder = apply { ops += CallFramePathOp.Close }

    public fun append(other: List<CallFramePathOp>): CallFramePathBuilder = apply {
        check(turn == null) { "on ajoute un tracé fini à un tracé non tourné" }
        ops += other
    }

    /** Le polygone fermé qui passe par [points] (vide ⇒ rien). */
    public fun polygon(points: List<Pair<Double, Double>>): CallFramePathBuilder = apply {
        val first = points.firstOrNull() ?: return@apply
        moveTo(first.first, first.second)
        points.drop(1).forEach { lineTo(it.first, it.second) }
        close()
    }

    public fun build(): List<CallFramePathOp> = ops.toList()
}

/** Raccourci : `buildPath { moveTo(…) }`. */
public inline fun buildCallFramePath(turn: CallFrameTurn? = null, body: CallFramePathBuilder.() -> Unit): List<CallFramePathOp> =
    CallFramePathBuilder(turn).apply(body).build()
