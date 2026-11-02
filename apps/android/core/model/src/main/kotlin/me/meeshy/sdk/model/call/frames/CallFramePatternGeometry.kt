package me.meeshy.sdk.model.call.frames

import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.TAU
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.lattice
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.rand

/** Ce qu'un motif dessine : ce qu'on remplit, ce qu'on trace (avec [lineWidth]). Les deux peuvent coexister (circuit). */
public data class CallFramePatternPlan(
    val fill: List<CallFramePathOp>,
    val stroke: List<CallFramePathOp>,
    val lineWidth: Double,
)

/**
 * LES QUATORZE MOTIFS (§ 4.3) — le port de `frame-paint-decor.ts` : tout se mesure en `unit`, si bien
 * qu'une vignette de 108 × 192 et une capture de 1080 × 1920 montrent le même dessin.
 */
public object CallFramePatternGeometry {

    public fun plan(kind: CallFramePatternKind, width: Double, height: Double, unit: Double): CallFramePatternPlan =
        when (kind) {
            CallFramePatternKind.DOTS -> dots(width, height, unit)
            CallFramePatternKind.STRIPES -> stripes(width, height, unit)
            CallFramePatternKind.GRID -> grid(width, height, unit)
            CallFramePatternKind.CHECKER -> checker(width, height, unit)
            CallFramePatternKind.HALFTONE -> halftone(width, height, unit)
            CallFramePatternKind.SCANLINES -> scanlines(width, height, unit)
            CallFramePatternKind.GRAIN -> grain(width, height, unit)
            CallFramePatternKind.STARS -> stars(width, height, unit)
            CallFramePatternKind.CONFETTI -> confetti(width, height, unit)
            CallFramePatternKind.SUNBURST -> sunburst(width, height)
            CallFramePatternKind.WAVES -> waves(width, height, unit)
            CallFramePatternKind.CIRCUIT -> circuit(width, height, unit)
            CallFramePatternKind.DAMASK -> damask(width, height, unit)
            CallFramePatternKind.HEARTS -> hearts(width, height, unit)
        }

    private fun filled(ops: List<CallFramePathOp>) = CallFramePatternPlan(ops, emptyList(), 0.0)

    private fun dots(w: Double, h: Double, unit: Double): CallFramePatternPlan {
        val step = unit * 0.045
        return filled(buildCallFramePath { lattice(w, h, step, true).forEach { addCircle(it.x, it.y, step * 0.11) } })
    }

    private fun stripes(w: Double, h: Double, unit: Double): CallFramePatternPlan {
        val step = unit * 0.06
        val reach = w + h
        return filled(
            buildCallFramePath {
                (0..ceil(reach / step).toInt()).map { it * step - h }.forEach { x ->
                    moveTo(x, h)
                    lineTo(x + step * 0.4, h)
                    lineTo(x + step * 0.4 + h, 0.0)
                    lineTo(x + h, 0.0)
                    close()
                }
            },
        )
    }

    private fun grid(w: Double, h: Double, unit: Double): CallFramePatternPlan {
        val step = unit * 0.06
        val lines = buildCallFramePath {
            (0..ceil(w / step).toInt()).map { it * step }.forEach { x ->
                moveTo(x, 0.0)
                lineTo(x, h)
            }
            (0..ceil(h / step).toInt()).map { it * step }.forEach { y ->
                moveTo(0.0, y)
                lineTo(w, y)
            }
        }
        return CallFramePatternPlan(emptyList(), lines, max(0.5, unit * 0.0016))
    }

    private fun checker(w: Double, h: Double, unit: Double): CallFramePatternPlan {
        val step = unit * 0.08
        return filled(
            buildCallFramePath {
                lattice(w, h, step, false).filter { (it.row + it.col) % 2 == 0 }
                    .forEach { addRect(CallFrameRect(it.x - step / 2, it.y - step / 2, step, step)) }
            },
        )
    }

    private fun halftone(w: Double, h: Double, unit: Double): CallFramePatternPlan {
        val step = unit * 0.028
        return filled(
            buildCallFramePath {
                lattice(w, h, step, true).forEach { point ->
                    val r = step * 0.46 * max(0.0, min(1.0, (point.y / h) * 1.15 - 0.1))
                    if (r >= 0.3) addCircle(point.x, point.y, r)
                }
            },
        )
    }

    private fun scanlines(w: Double, h: Double, unit: Double): CallFramePatternPlan {
        val step = max(2.0, unit * 0.008)
        return filled(
            buildCallFramePath {
                (0 until ceil(h / step).toInt()).forEach { addRect(CallFrameRect(0.0, it * step, w, step * 0.4)) }
            },
        )
    }

    private fun grain(w: Double, h: Double, unit: Double): CallFramePatternPlan {
        val dot = max(0.6, unit * 0.0022)
        return filled(
            buildCallFramePath {
                (0 until GRAIN_COUNT).forEach {
                    addRect(CallFrameRect(rand(301.0, it.toDouble()) * w, rand(302.0, it.toDouble()) * h, dot, dot))
                }
            },
        )
    }

    private fun stars(w: Double, h: Double, unit: Double): CallFramePatternPlan = filled(
        buildCallFramePath {
            (0 until STAR_COUNT).forEach {
                val draw = it.toDouble()
                fourPointStar(this, rand(311.0, draw) * w, rand(312.0, draw) * h, unit * (0.004 + rand(313.0, draw) * 0.012))
            }
        },
    )

    private fun confetti(w: Double, h: Double, unit: Double): CallFramePatternPlan {
        val all = mutableListOf<CallFramePathOp>()
        (0 until CONFETTI_COUNT).forEach {
            val draw = it.toDouble()
            val turn = CallFrameTurn(rand(321.0, draw) * w, rand(322.0, draw) * h, rand(323.0, draw) * TAU)
            all += buildCallFramePath(turn) {
                addRect(CallFrameRect(-unit * 0.009, -unit * 0.004, unit * 0.018, unit * 0.008))
            }
        }
        return filled(all)
    }

    private fun sunburst(w: Double, h: Double): CallFramePatternPlan {
        val cx = w / 2
        val cy = h * 0.42
        val reach = hypot(w, h)
        return filled(
            buildCallFramePath {
                (0 until RAYS).forEach { index ->
                    val from = index.toDouble() / RAYS * TAU
                    val to = from + TAU / (RAYS * 2)
                    moveTo(cx, cy)
                    lineTo(cx + cos(from) * reach, cy + sin(from) * reach)
                    lineTo(cx + cos(to) * reach, cy + sin(to) * reach)
                    close()
                }
            },
        )
    }

    private fun waves(w: Double, h: Double, unit: Double): CallFramePatternPlan {
        val step = unit * 0.05
        val amplitude = unit * 0.012
        val wavelength = unit * 0.16
        val pitch = wavelength / 8
        val lines = buildCallFramePath {
            (0..ceil(h / step).toInt()).map { it * step }.forEach { y ->
                moveTo(0.0, y)
                (0..ceil(w / pitch).toInt()).map { it * pitch }.forEach { x ->
                    lineTo(x, y + sin(x / wavelength * TAU) * amplitude)
                }
            }
        }
        return CallFramePatternPlan(emptyList(), lines, max(0.6, unit * 0.0022))
    }

    private fun circuit(w: Double, h: Double, unit: Double): CallFramePatternPlan {
        val step = unit * 0.05
        val pads = mutableListOf<Pair<Double, Double>>()
        val lines = buildCallFramePath {
            (0 until TRACES).forEach { index ->
                val draw = index.toDouble()
                val x0 = (rand(331.0, draw) * w / step).roundHalfUp() * step
                val y0 = (rand(332.0, draw) * h / step).roundHalfUp() * step
                val run = (1 + floor(rand(333.0, draw) * 4)) * step
                val turn = (1 + floor(rand(334.0, draw) * 3)) * step * (if (rand(335.0, draw) > 0.5) 1 else -1)
                val across = rand(336.0, draw) > 0.5
                val firstX = if (across) x0 + run else x0
                val firstY = if (across) y0 else y0 + run
                val secondX = if (across) firstX + kotlin.math.abs(turn) * 0.7 else firstX + turn
                val secondY = if (across) firstY + turn else firstY + kotlin.math.abs(turn) * 0.7
                moveTo(x0, y0)
                lineTo(firstX, firstY)
                lineTo(secondX, secondY)
                pads.add(x0 to y0)
                pads.add(secondX to secondY)
            }
        }
        val dots = buildCallFramePath { pads.forEach { addCircle(it.first, it.second, unit * 0.006) } }
        return CallFramePatternPlan(dots, lines, max(0.6, unit * 0.002))
    }

    private fun damask(w: Double, h: Double, unit: Double): CallFramePatternPlan {
        val step = unit * 0.16
        return filled(buildCallFramePath { lattice(w, h, step, true).forEach { damaskMotif(this, it.x, it.y, step * 0.32) } })
    }

    private fun hearts(w: Double, h: Double, unit: Double): CallFramePatternPlan {
        val step = unit * 0.09
        return filled(
            buildCallFramePath {
                lattice(w, h, step, true).forEach {
                    append(
                        CallFrameShapeGeometry.heartPath(
                            CallFrameRect(it.x - step * 0.14, it.y - step * 0.13, step * 0.28, step * 0.26),
                        ),
                    )
                }
            },
        )
    }

    /** Une étoile à quatre pointes (courbes quadratiques vers le centre). */
    internal fun fourPointStar(path: CallFramePathBuilder, x: Double, y: Double, r: Double) {
        path.moveTo(x, y - r)
        path.quadTo(x, y, x + r, y)
        path.quadTo(x, y, x, y + r)
        path.quadTo(x, y, x - r, y)
        path.quadTo(x, y, x, y - r)
        path.close()
    }

    internal fun damaskMotif(path: CallFramePathBuilder, x: Double, y: Double, s: Double) {
        fun cubic(c1: Pair<Double, Double>, c2: Pair<Double, Double>, to: Pair<Double, Double>) =
            path.cubicTo(x + s * c1.first, y + s * c1.second, x + s * c2.first, y + s * c2.second, x + s * to.first, y + s * to.second)
        fun move(p: Pair<Double, Double>) = path.moveTo(x + s * p.first, y + s * p.second)
        move(0.0 to -1.0)
        cubic(0.55 to -0.55, 0.2 to -0.1, 0.0 to 0.0)
        cubic(-0.2 to -0.1, -0.55 to -0.55, 0.0 to -1.0)
        move(0.0 to 1.0)
        cubic(0.55 to 0.55, 0.2 to 0.1, 0.0 to 0.0)
        cubic(-0.2 to 0.1, -0.55 to 0.55, 0.0 to 1.0)
        move(-0.9 to 0.0)
        cubic(-0.45 to -0.35, -0.15 to -0.12, 0.0 to 0.0)
        cubic(-0.15 to 0.12, -0.45 to 0.35, -0.9 to 0.0)
        move(0.9 to 0.0)
        cubic(0.45 to -0.35, 0.15 to -0.12, 0.0 to 0.0)
        cubic(0.15 to 0.12, 0.45 to 0.35, 0.9 to 0.0)
    }

    private fun Double.roundHalfUp(): Double = roundToInt().toDouble()

    private const val GRAIN_COUNT = 2600
    private const val STAR_COUNT = 70
    private const val CONFETTI_COUNT = 80
    private const val RAYS = 18
    private const val TRACES = 46
}
