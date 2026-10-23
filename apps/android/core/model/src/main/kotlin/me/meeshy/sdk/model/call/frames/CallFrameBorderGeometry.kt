package me.meeshy.sdk.model.call.frames

import kotlin.math.PI
import kotlin.math.max
import kotlin.math.sin
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.TAU
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.corners
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.inset
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.perimeter
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.rand

public enum class CallFramePaintStyle { STROKE, FILL, FILL_EVEN_ODD }

/** Une ombre sans décalage : le halo d'un néon, le relief d'un bord déchiré. */
public data class CallFrameShadow(val blur: Double, val color: CallFrameColor)

/** Une étape de peinture d'une bordure ; les traits sont toujours à bouts et jointures arrondis. */
public sealed interface CallFrameBorderStep {
    public data class Shape(
        val ops: List<CallFramePathOp>,
        val style: CallFramePaintStyle,
        val width: Double,
        val color: CallFrameColor,
        val shadow: CallFrameShadow? = null,
        val dash: List<Double>? = null,
    ) : CallFrameBorderStep

    /** Un halo radial qui s'éteint à [radius]. */
    public data class Glow(val cx: Double, val cy: Double, val radius: Double, val color: CallFrameColor) : CallFrameBorderStep

    /** Une ampoule : blanc au point de lumière, [color] sur le bord, avec son halo à part. */
    public data class Bulb(val cx: Double, val cy: Double, val radius: Double, val color: CallFrameColor) : CallFrameBorderStep
}

/**
 * LES QUATORZE BORDURES (§ 4.3) — le port de `paintBorder` de `frame-paint-decor.ts` : la bordure d'un
 * cadre est une SUITE d'étapes de peinture, calculée ici en unités de la toile ; le canevas Android n'a
 * qu'à les rejouer dans l'ordre.
 */
public object CallFrameBorderGeometry {
    private val WHITE = "#FFFFFF"

    public fun plan(border: CallFrameBorder, width: Double, height: Double, unit: Double): List<CallFrameBorderStep> {
        val line = max(0.75, border.width * unit)
        val edge = inset(CallFrameRect(0.0, 0.0, width, height), border.inset * unit)
        val frame = inset(edge, line / 2)
        val ink = CallFrameRenderKit.color(border.color)
        fun stroke(ops: List<CallFramePathOp>, w: Double = line, color: CallFrameColor = ink, shadow: CallFrameShadow? = null) =
            CallFrameBorderStep.Shape(ops, CallFramePaintStyle.STROKE, w, color, shadow)
        fun fill(ops: List<CallFramePathOp>, style: CallFramePaintStyle = CallFramePaintStyle.FILL, color: CallFrameColor = ink, shadow: CallFrameShadow? = null) =
            CallFrameBorderStep.Shape(ops, style, line, color, shadow)
        fun rect(rect: CallFrameRect) = buildCallFramePath { addRect(rect) }
        return when (border.kind) {
            CallFrameBorderKind.HAIRLINE -> listOf(stroke(rect(frame)))
            CallFrameBorderKind.DOUBLE ->
                listOf(stroke(rect(frame)), stroke(rect(inset(frame, line * 2.6)), line * 0.5))
            CallFrameBorderKind.DECO -> deco(frame, line, unit, ink)
            CallFrameBorderKind.BAROQUE -> baroque(frame, line, unit, ink)
            CallFrameBorderKind.FILMSTRIP -> filmstrip(edge, border.color, line, unit, height >= width, ink)
            CallFrameBorderKind.TICKET -> ticket(frame, line, unit, ink)
            CallFrameBorderKind.PERFORATED -> {
                val step = max(line * 2.4, unit * 0.018)
                listOf(fill(buildCallFramePath { perimeter(frame, step).forEach { addCircle(it.x, it.y, line * 0.7) } }))
            }
            CallFrameBorderKind.NEON -> {
                val rounded = buildCallFramePath { addRoundRect(frame, unit * 0.035) }
                listOf(
                    stroke(rounded, shadow = CallFrameShadow(unit * 0.035, ink)),
                    stroke(
                        rounded,
                        line * 0.4,
                        CallFrameRenderKit.mix(border.color, WHITE, 0.65),
                        CallFrameShadow(unit * 0.012, ink),
                    ),
                )
            }
            CallFrameBorderKind.BRACKETS -> {
                val arm = unit * 0.075
                listOf(
                    stroke(
                        buildCallFramePath {
                            corners(frame).forEach { corner ->
                                moveTo(corner.x, corner.y + corner.sy * arm)
                                lineTo(corner.x, corner.y)
                                lineTo(corner.x + corner.sx * arm, corner.y)
                            }
                        },
                    ),
                )
            }
            CallFrameBorderKind.TORN -> {
                val ops = buildCallFramePath {
                    addRect(CallFrameRect(0.0, 0.0, width, height))
                    append(jagged(inset(edge, line), max(line, unit * 0.012)))
                }
                listOf(fill(ops, CallFramePaintStyle.FILL_EVEN_ODD, shadow = CallFrameShadow(unit * 0.012, CallFrameColor(0.0, 0.0, 0.0, 0.28))))
            }
            CallFrameBorderKind.MOURNING -> {
                val inner = inset(edge, line)
                listOf(
                    fill(band(edge, inner), CallFramePaintStyle.FILL_EVEN_ODD),
                    stroke(rect(inset(inner, unit * 0.012)), max(0.75, unit * 0.0025)),
                )
            }
            CallFrameBorderKind.VINES -> vines(frame, line, unit, ink)
            CallFrameBorderKind.BULBS -> {
                val r = max(line, unit * 0.011)
                perimeter(frame, unit * 0.075).flatMap { point ->
                    listOf(
                        CallFrameBorderStep.Glow(point.x, point.y, r * 3.2, CallFrameRenderKit.tint(border.color, 0.55)),
                        CallFrameBorderStep.Bulb(point.x, point.y, r, ink),
                    )
                }
            }
            CallFrameBorderKind.POLAROID -> {
                val foot = line * 3.2
                val inner = CallFrameRect(edge.minX + line, edge.minY + line, edge.width - line * 2, edge.height - line - foot)
                listOf(
                    fill(band(edge, inner), CallFramePaintStyle.FILL_EVEN_ODD),
                    stroke(rect(inner), max(0.5, unit * 0.0015), CallFrameColor(0.0, 0.0, 0.0, 0.12)),
                )
            }
        }
    }

    /** Le cadre en anneau : deux rectangles à remplir en pair-impair. */
    public fun band(outer: CallFrameRect, inner: CallFrameRect): List<CallFramePathOp> =
        buildCallFramePath {
            addRect(outer)
            addRect(inner)
        }

    /** Un contour rongé : les points du périmètre poussés vers l'intérieur ou l'extérieur au hasard. */
    public fun jagged(frame: CallFrameRect, depth: Double): List<CallFramePathOp> =
        buildCallFramePath {
            perimeter(frame, depth * 1.6).forEachIndexed { index, point ->
                val push = (rand(401.0, index.toDouble()) - 0.35) * depth
                val nx = when (point.side) { 1 -> -1.0; 3 -> 1.0; else -> 0.0 }
                val ny = when (point.side) { 0 -> 1.0; 2 -> -1.0; else -> 0.0 }
                val x = point.x + nx * push
                val y = point.y + ny * push
                if (index == 0) moveTo(x, y) else lineTo(x, y)
            }
            close()
        }

    private fun deco(frame: CallFrameRect, line: Double, unit: Double, ink: CallFrameColor): List<CallFrameBorderStep> {
        val arm = unit * 0.13
        val step = max(line * 2.2, unit * 0.012)
        val steps = buildCallFramePath {
            corners(frame).forEach { corner ->
                (1..3).forEach { level ->
                    val offset = step * level
                    val length = arm * (1 - level * 0.22)
                    moveTo(corner.x + corner.sx * offset, corner.y + corner.sy * (offset + length))
                    lineTo(corner.x + corner.sx * offset, corner.y + corner.sy * offset)
                    lineTo(corner.x + corner.sx * (offset + length), corner.y + corner.sy * offset)
                }
            }
        }
        val gems = buildCallFramePath {
            corners(frame).forEach { corner ->
                val cx = corner.x + corner.sx * step * 4.6
                val cy = corner.y + corner.sy * step * 4.6
                val r = step * 0.9
                polygon(listOf(cx to cy - r, cx + r to cy, cx to cy + r, cx - r to cy))
            }
        }
        return listOf(
            CallFrameBorderStep.Shape(buildCallFramePath { addRect(frame) }, CallFramePaintStyle.STROKE, line * 0.6, ink),
            CallFrameBorderStep.Shape(steps, CallFramePaintStyle.STROKE, line, ink),
            CallFrameBorderStep.Shape(gems, CallFramePaintStyle.FILL, line, ink),
        )
    }

    private fun baroque(frame: CallFrameRect, line: Double, unit: Double, ink: CallFrameColor): List<CallFrameBorderStep> {
        val s = unit * 0.075
        val curls = buildCallFramePath {
            corners(frame).forEach { c ->
                fun x(dx: Double) = c.x + c.sx * s * dx
                fun y(dy: Double) = c.y + c.sy * s * dy
                moveTo(x(1.9), y(0.0))
                cubicTo(x(1.1), y(0.1), x(0.9), y(0.9), x(0.45), y(0.55))
                cubicTo(x(0.15), y(0.3), x(0.4), y(0.05), x(0.6), y(0.3))
                moveTo(x(0.0), y(1.9))
                cubicTo(x(0.1), y(1.1), x(0.9), y(0.9), x(0.55), y(0.45))
                cubicTo(x(0.3), y(0.15), x(0.05), y(0.4), x(0.3), y(0.6))
            }
        }
        val pearls = buildCallFramePath {
            corners(frame).forEach { c -> addCircle(c.x + c.sx * s * 0.72, c.y + c.sy * s * 0.72, s * 0.12) }
        }
        return listOf(
            CallFrameBorderStep.Shape(buildCallFramePath { addRect(frame) }, CallFramePaintStyle.STROKE, line * 0.7, ink),
            CallFrameBorderStep.Shape(buildCallFramePath { addRect(inset(frame, unit * 0.018)) }, CallFramePaintStyle.STROKE, line * 0.4, ink),
            CallFrameBorderStep.Shape(curls, CallFramePaintStyle.STROKE, line, ink),
            CallFrameBorderStep.Shape(pearls, CallFramePaintStyle.FILL, line, ink),
        )
    }

    private fun filmstrip(
        edge: CallFrameRect,
        hex: String,
        line: Double,
        unit: Double,
        portrait: Boolean,
        ink: CallFrameColor,
    ): List<CallFrameBorderStep> {
        val band = max(line, unit * 0.045)
        val strips = if (portrait) {
            listOf(
                CallFrameRect(edge.minX, edge.minY, band, edge.height),
                CallFrameRect(edge.maxX - band, edge.minY, band, edge.height),
            )
        } else {
            listOf(
                CallFrameRect(edge.minX, edge.minY, edge.width, band),
                CallFrameRect(edge.minX, edge.maxY - band, edge.width, band),
            )
        }
        val hole = band * 0.42
        val holeColor = if (CallFrameRenderKit.perceived(hex) > 0.5) {
            CallFrameColor(20 / 255.0, 20 / 255.0, 20 / 255.0, 0.85)
        } else {
            CallFrameColor(246 / 255.0, 240 / 255.0, 226 / 255.0, 0.92)
        }
        val holes = buildCallFramePath {
            strips.forEach { strip ->
                val length = if (portrait) strip.height else strip.width
                val count = max(2, kotlin.math.floor(length / (hole * 2.1)).toInt())
                (0 until count).map { length / count * (it + 0.5) }.forEach { at ->
                    val x = if (portrait) strip.minX + (band - hole * 0.8) / 2 else strip.minX + at - hole / 2
                    val y = if (portrait) strip.minY + at - hole / 2 else strip.minY + (band - hole * 0.8) / 2
                    val rect = if (portrait) CallFrameRect(x, y, hole * 0.8, hole) else CallFrameRect(x, y, hole, hole * 0.8)
                    addRoundRect(rect, hole * 0.18)
                }
            }
        }
        return listOf(
            CallFrameBorderStep.Shape(buildCallFramePath { strips.forEach { addRect(it) } }, CallFramePaintStyle.FILL, line, ink),
            CallFrameBorderStep.Shape(holes, CallFramePaintStyle.FILL, line, holeColor),
        )
    }

    private fun ticket(frame: CallFrameRect, line: Double, unit: Double, ink: CallFrameColor): List<CallFrameBorderStep> {
        val notch = unit * 0.045
        val x = frame.minX
        val y = frame.minY
        val w = frame.width
        val h = frame.height
        val outline = buildCallFramePath {
            moveTo(x + notch, y)
            lineTo(x + w - notch, y)
            arc(x + w, y, notch, PI, PI / 2, anticlockwise = true)
            lineTo(x + w, y + h / 2 - notch * 0.7)
            arc(x + w, y + h / 2, notch * 0.7, -PI / 2, PI / 2, anticlockwise = true)
            lineTo(x + w, y + h - notch)
            arc(x + w, y + h, notch, -PI / 2, -PI, anticlockwise = true)
            lineTo(x + notch, y + h)
            arc(x, y + h, notch, 0.0, -PI / 2, anticlockwise = true)
            lineTo(x, y + h / 2 + notch * 0.7)
            arc(x, y + h / 2, notch * 0.7, PI / 2, -PI / 2, anticlockwise = true)
            lineTo(x, y + notch)
            arc(x, y, notch, PI / 2, 0.0, anticlockwise = true)
            close()
        }
        val tear = buildCallFramePath {
            moveTo(x + notch * 0.9, y + h / 2)
            lineTo(x + w - notch * 0.9, y + h / 2)
        }
        return listOf(
            CallFrameBorderStep.Shape(outline, CallFramePaintStyle.STROKE, line, ink),
            CallFrameBorderStep.Shape(
                tear, CallFramePaintStyle.STROKE, line * 0.6, ink.copy(alpha = ink.alpha * 0.35),
                dash = listOf(line * 1.5, line * 2.5),
            ),
        )
    }

    private fun vines(frame: CallFrameRect, line: Double, unit: Double, ink: CallFrameColor): List<CallFrameBorderStep> {
        val amplitude = unit * 0.012
        val wavelength = unit * 0.12
        val points = perimeter(frame, wavelength / 6)
        val stem = buildCallFramePath {
            points.forEachIndexed { index, point ->
                val wave = sin(index / 6.0 * TAU) * amplitude
                val x = point.x + if (point.side == 1 || point.side == 3) wave else 0.0
                val y = point.y + if (point.side == 0 || point.side == 2) wave else 0.0
                if (index == 0) moveTo(x, y) else lineTo(x, y)
            }
            close()
        }
        val leaves = mutableListOf<CallFramePathOp>()
        points.withIndex().filter { it.index % 3 == 1 }.map { it.value }.forEachIndexed { index, point ->
            val draw = index.toDouble()
            val length = unit * (0.012 + rand(411.0, draw) * 0.008)
            leaves += buildCallFramePath(CallFrameTurn(point.x, point.y, rand(412.0, draw) * TAU)) {
                moveTo(0.0, 0.0)
                quadTo(length, -length * 0.9, length * 2, 0.0)
                quadTo(length, length * 0.9, 0.0, 0.0)
            }
        }
        return listOf(
            CallFrameBorderStep.Shape(stem, CallFramePaintStyle.STROKE, max(0.75, line * 0.6), ink),
            CallFrameBorderStep.Shape(leaves, CallFramePaintStyle.FILL, line, ink),
        )
    }
}
