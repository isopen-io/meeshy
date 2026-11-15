package me.meeshy.sdk.model.game

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

/** Un segment de chemin en coordonnées ABSOLUES, après résolution des commandes relatives. */
sealed interface GameSvgSegment {
    data class MoveTo(val x: Double, val y: Double) : GameSvgSegment
    data class LineTo(val x: Double, val y: Double) : GameSvgSegment
    data class QuadTo(val cx: Double, val cy: Double, val x: Double, val y: Double) : GameSvgSegment
    data class CubicTo(
        val c1x: Double, val c1y: Double,
        val c2x: Double, val c2y: Double,
        val x: Double, val y: Double,
    ) : GameSvgSegment
    data object Close : GameSvgSegment
}

/**
 * Le lecteur de chemins SVG du jeu (miroir de `SVGPathData.swift`) : la même chaîne `d="…"` que la
 * planche, M L H V C S Q A Z en absolu ou en relatif. Les arcs deviennent des cubiques (90° au plus
 * chacune). Une chaîne mal formée s'arrête là où elle casse : on ne devine pas.
 */
object GameSvgSegments {

    fun parse(d: String): List<GameSvgSegment> = Parser(d).parse()

    private class Parser(private val text: String) {
        var index = 0
        val out = mutableListOf<GameSvgSegment>()
        var cx = 0.0
        var cy = 0.0
        var startX = 0.0
        var startY = 0.0
        var lastCubic: Pair<Double, Double>? = null

        fun parse(): List<GameSvgSegment> {
            var command: Char? = null
            while (true) {
                skipSeparators()
                if (index >= text.length) break
                val ch = text[index]
                if (ch.isLetter() && ch != 'e' && ch != 'E') {
                    command = ch
                    index++
                    if (ch == 'Z' || ch == 'z') {
                        out += GameSvgSegment.Close
                        cx = startX
                        cy = startY
                        lastCubic = null
                        command = null
                    }
                    continue
                }
                val active = command ?: break
                if (!run(active)) break
                if (active == 'M') command = 'L' else if (active == 'm') command = 'l'
            }
            return out
        }

        private fun skipSeparators() {
            while (index < text.length && text[index].let { it == ' ' || it == ',' || it == '\n' || it == '\t' || it == '\r' }) index++
        }

        private fun number(): Double? {
            skipSeparators()
            val start = index
            var seenDot = false
            var seenExp = false
            if (index < text.length && (text[index] == '-' || text[index] == '+')) index++
            while (index < text.length) {
                val c = text[index]
                if (c in '0'..'9') {
                    index++
                } else if (c == '.' && !seenDot && !seenExp) {
                    seenDot = true
                    index++
                } else if ((c == 'e' || c == 'E') && !seenExp && index > start) {
                    seenExp = true
                    index++
                    if (index < text.length && (text[index] == '-' || text[index] == '+')) index++
                } else {
                    break
                }
            }
            if (index == start) return null
            return text.substring(start, index).toDoubleOrNull()
        }

        private fun flag(): Boolean? {
            skipSeparators()
            if (index >= text.length || (text[index] != '0' && text[index] != '1')) return null
            return (text[index++] == '1')
        }

        private fun numbers(count: Int): DoubleArray? {
            val values = DoubleArray(count)
            for (i in 0 until count) values[i] = number() ?: return null
            return values
        }

        private fun run(command: Char): Boolean {
            val relative = command.isLowerCase()
            val ox = if (relative) cx else 0.0
            val oy = if (relative) cy else 0.0
            when (command) {
                'M', 'm' -> {
                    val v = numbers(2) ?: return false
                    out += GameSvgSegment.MoveTo(ox + v[0], oy + v[1])
                    cx = ox + v[0]; cy = oy + v[1]
                    startX = cx; startY = cy
                    lastCubic = null
                }
                'L', 'l' -> {
                    val v = numbers(2) ?: return false
                    line(ox + v[0], oy + v[1])
                }
                'H', 'h' -> {
                    val x = number() ?: return false
                    line((if (relative) cx else 0.0) + x, cy)
                }
                'V', 'v' -> {
                    val y = number() ?: return false
                    line(cx, (if (relative) cy else 0.0) + y)
                }
                'C', 'c' -> {
                    val v = numbers(6) ?: return false
                    cubic(ox + v[0], oy + v[1], ox + v[2], oy + v[3], ox + v[4], oy + v[5])
                }
                'S', 's' -> {
                    val v = numbers(4) ?: return false
                    val r = lastCubic?.let { 2 * cx - it.first to 2 * cy - it.second } ?: (cx to cy)
                    cubic(r.first, r.second, ox + v[0], oy + v[1], ox + v[2], oy + v[3])
                }
                'Q', 'q' -> {
                    val v = numbers(4) ?: return false
                    out += GameSvgSegment.QuadTo(ox + v[0], oy + v[1], ox + v[2], oy + v[3])
                    cx = ox + v[2]; cy = oy + v[3]
                    lastCubic = null
                }
                'A', 'a' -> {
                    val radii = numbers(3) ?: return false
                    val large = flag() ?: return false
                    val sweep = flag() ?: return false
                    val end = numbers(2) ?: return false
                    val tx = ox + end[0]
                    val ty = oy + end[1]
                    arc(cx, cy, radii[0], radii[1], radii[2], large, sweep, tx, ty)
                    cx = tx; cy = ty
                    lastCubic = null
                }
                else -> return false
            }
            return true
        }

        private fun line(x: Double, y: Double) {
            out += GameSvgSegment.LineTo(x, y)
            cx = x; cy = y
            lastCubic = null
        }

        private fun cubic(c1x: Double, c1y: Double, c2x: Double, c2y: Double, x: Double, y: Double) {
            out += GameSvgSegment.CubicTo(c1x, c1y, c2x, c2y, x, y)
            cx = x; cy = y
            lastCubic = c2x to c2y
        }

        /** Arc elliptique de l'annexe F.6 de SVG, découpé en cubiques de 90° au plus. */
        private fun arc(
            x0: Double, y0: Double, radiusX: Double, radiusY: Double, rotationDegrees: Double,
            large: Boolean, sweep: Boolean, x1: Double, y1: Double,
        ) {
            var rx = abs(radiusX)
            var ry = abs(radiusY)
            if (x0 == x1 && y0 == y1) return
            if (rx == 0.0 || ry == 0.0) {
                out += GameSvgSegment.LineTo(x1, y1)
                return
            }
            val phi = rotationDegrees * PI / 180
            val cosPhi = cos(phi)
            val sinPhi = sin(phi)
            val dx = (x0 - x1) / 2
            val dy = (y0 - y1) / 2
            val xp = cosPhi * dx + sinPhi * dy
            val yp = -sinPhi * dx + cosPhi * dy
            val lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry)
            if (lambda > 1) {
                val s = sqrt(lambda)
                rx *= s
                ry *= s
            }
            val numerator = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
            val denominator = rx * rx * yp * yp + ry * ry * xp * xp
            val sign = if (large == sweep) -1.0 else 1.0
            val coefficient = if (denominator == 0.0) 0.0 else sign * sqrt(max(0.0, numerator / denominator))
            val cxp = coefficient * (rx * yp / ry)
            val cyp = coefficient * (-(ry * xp) / rx)
            val centerX = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2
            val centerY = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2

            fun angle(ux: Double, uy: Double, vx: Double, vy: Double) = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
            val theta1 = angle(1.0, 0.0, (xp - cxp) / rx, (yp - cyp) / ry)
            var delta = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
            if (!sweep && delta > 0) delta -= 2 * PI
            if (sweep && delta < 0) delta += 2 * PI

            val segments = max(1, ceil(abs(delta) / (PI / 2)).toInt())
            val step = delta / segments
            val handle = 4.0 / 3.0 * tan(step / 4)

            fun px(t: Double) = centerX + rx * cos(t) * cosPhi - ry * sin(t) * sinPhi
            fun py(t: Double) = centerY + rx * cos(t) * sinPhi + ry * sin(t) * cosPhi
            fun dxp(t: Double) = -rx * sin(t) * cosPhi - ry * cos(t) * sinPhi
            fun dyp(t: Double) = -rx * sin(t) * sinPhi + ry * cos(t) * cosPhi

            for (segment in 0 until segments) {
                val a = theta1 + segment * step
                val b = a + step
                val sx = px(a)
                val sy = py(a)
                val ex = if (segment == segments - 1) x1 else px(b)
                val ey = if (segment == segments - 1) y1 else py(b)
                out += GameSvgSegment.CubicTo(
                    sx + handle * dxp(a), sy + handle * dyp(a),
                    ex - handle * dxp(b), ey - handle * dyp(b),
                    ex, ey,
                )
            }
        }
    }
}
