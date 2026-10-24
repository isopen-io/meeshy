package me.meeshy.sdk.model.call.frames

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.TAU
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.rand

/**
 * LES FORMES DES CASES (§ 4.2) — le port de `frame-paint-shapes.ts` et de `CallFrameRenderer+Shapes.swift` :
 * quinze contours, tracés en [CallFramePathOp] dans le repère de la case (avant rotation), centrés dans
 * leur rectangle et sans le déborder. `circle`, `hex`, `star` et `heart` gardent leurs proportions.
 */
public object CallFrameShapeGeometry {
    public const val DEFAULT_ROUND_RADIUS: Double = 0.08
    public const val MEDALLION_RATIO: Double = 0.75
    private val HEX_RATIO = 2 / sqrt(3.0)

    /** Le contour d'une case de forme [shape] dans [rect] ; [seed] fige le hasard des galets et des déchirures. */
    public fun slotPath(shape: CallFrameSlotShape, rect: CallFrameRect, radius: Double?, seed: Int): List<CallFramePathOp> {
        if (rect.width <= 0 || rect.height <= 0) return buildCallFramePath { addRect(rect) }
        val side = min(rect.width, rect.height)
        return when (shape) {
            CallFrameSlotShape.RECT -> buildCallFramePath { addRect(rect) }
            CallFrameSlotShape.ROUND ->
                buildCallFramePath { addRoundRect(rect, (radius ?: DEFAULT_ROUND_RADIUS) * side) }
            CallFrameSlotShape.CIRCLE -> buildCallFramePath { addCircle(rect.midX, rect.midY, side / 2) }
            CallFrameSlotShape.OVAL -> buildCallFramePath { addOval(rect) }
            CallFrameSlotShape.ARCH -> archPath(rect)
            CallFrameSlotShape.HEX -> hexPath(rect)
            CallFrameSlotShape.DIAMOND -> buildCallFramePath {
                polygon(
                    listOf(
                        rect.midX to rect.minY, rect.maxX to rect.midY,
                        rect.midX to rect.maxY, rect.minX to rect.midY,
                    ),
                )
            }
            CallFrameSlotShape.HEART -> {
                val width = min(rect.width, rect.height * 1.1)
                val height = width / 1.1
                heartPath(CallFrameRect(rect.midX - width / 2, rect.midY - height / 2, width, height))
            }
            CallFrameSlotShape.STAR -> starPath(rect)
            CallFrameSlotShape.TICKET -> ticketPath(rect)
            CallFrameSlotShape.STAMP -> stampPath(rect)
            CallFrameSlotShape.BLOB -> blobPath(rect, seed)
            CallFrameSlotShape.TORN -> buildCallFramePath { polygon(tornPoints(rect, seed)) }
            CallFrameSlotShape.POLAROID -> buildCallFramePath { addRect(polaroidWindow(rect)) }
            CallFrameSlotShape.FRAME_OVAL -> buildCallFramePath { addOval(medallionRect(rect)) }
        }
    }

    public fun slotPath(box: CallFrameSlotBox, rect: CallFrameRect, slot: CallFrameSlotStyle): List<CallFramePathOp> =
        slotPath(box.shape, rect, slot.radius, box.index)

    private fun archPath(rect: CallFrameRect): List<CallFramePathOp> {
        val archRadius = min(rect.width / 2, rect.height)
        return buildCallFramePath {
            moveTo(rect.minX, rect.maxY)
            lineTo(rect.minX, rect.minY + archRadius)
            arc(rect.midX, rect.minY + archRadius, archRadius, PI, 0.0)
            lineTo(rect.maxX, rect.maxY)
            close()
        }
    }

    /**
     * Un bord déchiré (`tornPoints` du web) : les quatre côtés rongés vers l'intérieur par des dents
     * irrégulières (au plus 2,5 % du petit côté), les coins intacts — déterministe pour une même case.
     */
    public fun tornPoints(rect: CallFrameRect, seed: Int): List<Pair<Double, Double>> {
        val side = min(rect.width, rect.height)
        val depth = side * 0.025
        val step = side * 0.045
        if (step <= 0) return listOf(rect.x to rect.y)
        fun edge(
            from: Pair<Double, Double>,
            to: Pair<Double, Double>,
            inwardX: Double,
            inwardY: Double,
            salt: Int,
        ): List<Pair<Double, Double>> {
            val count = max(4, (hypot(to.first - from.first, to.second - from.second) / step).roundToInt())
            return (0 until count).map { index ->
                val share = index.toDouble() / count
                val bite = if (index == 0) 0.0 else rand((seed + 23).toDouble(), (salt * 1000 + index).toDouble()) * depth
                (from.first + (to.first - from.first) * share + inwardX * bite) to
                    (from.second + (to.second - from.second) * share + inwardY * bite)
            }
        }
        val topLeft = rect.minX to rect.minY
        val topRight = rect.maxX to rect.minY
        val bottomRight = rect.maxX to rect.maxY
        val bottomLeft = rect.minX to rect.maxY
        return edge(topLeft, topRight, 0.0, 1.0, 0) +
            edge(topRight, bottomRight, -1.0, 0.0, 1) +
            edge(bottomRight, bottomLeft, 0.0, -1.0, 2) +
            edge(bottomLeft, topLeft, 1.0, 0.0, 3)
    }

    /** La photo d'un polaroid : carrée, marges fines en haut et sur les côtés, la marge du bas épaisse (20 % au moins). */
    public fun polaroidWindow(rect: CallFrameRect): CallFrameRect {
        val pad = min(rect.width, rect.height) * 0.06
        val side = max(0.0, min(rect.width - pad * 2, rect.height - pad - rect.height * 0.2))
        return CallFrameRect(rect.minX + (rect.width - side) / 2, rect.minY + pad, side, side)
    }

    /** Le rectangle d'un médaillon : un ovale vertical 3:4, le plus grand qui tient, centré. */
    public fun medallionRect(rect: CallFrameRect): CallFrameRect {
        val width = min(rect.width, rect.height * MEDALLION_RATIO)
        val height = width / MEDALLION_RATIO
        return CallFrameRect(rect.midX - width / 2, rect.midY - height / 2, width, height)
    }

    /** Le cœur de `call-montage-render.ts` (`heartPath`), le même tracé que le web. */
    public fun heartPath(box: CallFrameRect): List<CallFramePathOp> {
        val x = box.minX
        val y = box.minY
        val w = box.width
        val h = box.height
        return buildCallFramePath {
            moveTo(x + w / 2, y + h * 0.28)
            cubicTo(x + w / 2, y + h * 0.06, x + w * 0.1, y - h * 0.02, x + w * 0.04, y + h * 0.3)
            cubicTo(x - w * 0.02, y + h * 0.58, x + w * 0.3, y + h * 0.76, x + w / 2, y + h * 0.96)
            cubicTo(x + w * 0.7, y + h * 0.76, x + w * 1.02, y + h * 0.58, x + w * 0.96, y + h * 0.3)
            cubicTo(x + w * 0.9, y - h * 0.02, x + w / 2, y + h * 0.06, x + w / 2, y + h * 0.28)
            close()
        }
    }

    /** Un hexagone régulier à pointe en haut, le plus grand qui tient dans [rect]. */
    public fun hexPath(rect: CallFrameRect): List<CallFramePathOp> {
        val width = min(rect.width, rect.height / HEX_RATIO)
        val height = width * HEX_RATIO
        val left = rect.midX - width / 2
        val right = rect.midX + width / 2
        val top = rect.midY - height / 2
        return buildCallFramePath {
            polygon(
                listOf(
                    rect.midX to top,
                    right to top + height / 4,
                    right to top + height * 3 / 4,
                    rect.midX to top + height,
                    left to top + height * 3 / 4,
                    left to top + height / 4,
                ),
            )
        }
    }

    /** Une étoile à cinq branches (rayon intérieur 0,5) posée dans [rect], pointe en haut. */
    public fun starPath(rect: CallFrameRect): List<CallFramePathOp> {
        val lower = cos(PI / 5)
        val outer = min(rect.width / (2 * sin(2 * PI / 5)), rect.height / (1 + lower))
        val inner = outer * 0.5
        val cx = rect.midX
        val cy = rect.minY + (rect.height - outer * (1 + lower)) / 2 + outer
        return buildCallFramePath {
            polygon(
                (0 until 10).map { index ->
                    val angle = -PI / 2 + index * PI / 5
                    val radius = if (index % 2 == 0) outer else inner
                    (cx + cos(angle) * radius) to (cy + sin(angle) * radius)
                },
            )
        }
    }

    /** Un billet : quatre coins encochés d'un quart de cercle. */
    public fun ticketPath(rect: CallFrameRect): List<CallFramePathOp> {
        val notch = min(rect.width, rect.height) * 0.12
        val x = rect.minX
        val y = rect.minY
        val w = rect.width
        val h = rect.height
        return buildCallFramePath {
            moveTo(x + notch, y)
            lineTo(x + w - notch, y)
            arc(x + w, y, notch, PI, PI / 2, anticlockwise = true)
            lineTo(x + w, y + h - notch)
            arc(x + w, y + h, notch, -PI / 2, -PI, anticlockwise = true)
            lineTo(x + notch, y + h)
            arc(x, y + h, notch, 0.0, -PI / 2, anticlockwise = true)
            lineTo(x, y + notch)
            arc(x, y, notch, PI / 2, 0.0, anticlockwise = true)
            close()
        }
    }

    /** Un bord de timbre : des morsures en demi-cercle, régulières, le long des quatre côtés. */
    public fun stampPath(rect: CallFrameRect): List<CallFramePathOp> {
        val bite = min(rect.width, rect.height) * 0.035
        val x = rect.minX
        val y = rect.minY
        val w = rect.width
        val h = rect.height
        fun bites(length: Double): List<Double> {
            val count = max(2, (length / max(bite * 3.2, 0.0001)).roundToInt())
            val step = length / count
            return (0 until count).map { step * (it + 0.5) }
        }
        return buildCallFramePath {
            moveTo(x, y)
            bites(w).forEach { at ->
                lineTo(x + at - bite, y)
                arc(x + at, y, bite, PI, 0.0, anticlockwise = true)
            }
            lineTo(x + w, y)
            bites(h).forEach { at ->
                lineTo(x + w, y + at - bite)
                arc(x + w, y + at, bite, -PI / 2, PI / 2, anticlockwise = true)
            }
            lineTo(x + w, y + h)
            bites(w).forEach { at ->
                lineTo(x + w - at + bite, y + h)
                arc(x + w - at, y + h, bite, 0.0, -PI, anticlockwise = true)
            }
            lineTo(x, y + h)
            bites(h).forEach { at ->
                lineTo(x, y + h - at + bite)
                arc(x, y + h - at, bite, PI / 2, -PI / 2, anticlockwise = true)
            }
            close()
        }
    }

    /** Un galet : un cercle déformé par deux harmoniques de phases tirées, lissé par des courbes quadratiques. */
    public fun blobPath(rect: CallFrameRect, seed: Int): List<CallFramePathOp> {
        val phaseA = rand((seed + 11).toDouble(), 0.0) * TAU
        val phaseB = rand((seed + 11).toDouble(), 1.0) * TAU
        val rx = rect.width / 2 / 1.09
        val ry = rect.height / 2 / 1.09
        val points = (0 until 36).map { index ->
            val angle = index.toDouble() / 36 * TAU
            val wobble = 1 + 0.055 * sin(3 * angle + phaseA) + 0.035 * sin(5 * angle + phaseB)
            (rect.midX + cos(angle) * rx * wobble) to (rect.midY + sin(angle) * ry * wobble)
        }
        fun mid(a: Pair<Double, Double>, b: Pair<Double, Double>) = ((a.first + b.first) / 2) to ((a.second + b.second) / 2)
        return buildCallFramePath {
            val start = mid(points.last(), points.first())
            moveTo(start.first, start.second)
            points.indices.forEach { index ->
                val control = points[index]
                val end = mid(points[index], points[(index + 1) % points.size])
                quadTo(control.first, control.second, end.first, end.second)
            }
            close()
        }
    }

    /** Le rectangle UTILE d'une forme — là où poser un bandeau, une pastille (`shapeInnerRect` du web). */
    public fun shapeInnerRect(shape: CallFrameSlotShape, rect: CallFrameRect): CallFrameRect {
        val side = min(rect.width, rect.height)
        fun around(width: Double, height: Double) =
            CallFrameRect(rect.midX - width / 2, rect.midY - height / 2, width, height)
        return when (shape) {
            CallFrameSlotShape.CIRCLE -> around(side * 0.82, side * 0.82)
            CallFrameSlotShape.OVAL -> around(rect.width * 0.82, rect.height * 0.82)
            CallFrameSlotShape.HEX -> around(
                min(rect.width, rect.height / HEX_RATIO),
                min(rect.height, rect.width * HEX_RATIO) * 0.7,
            )
            CallFrameSlotShape.DIAMOND -> around(rect.width * 0.5, rect.height * 0.5)
            CallFrameSlotShape.HEART ->
                CallFrameRect(rect.midX - side * 0.3, rect.minY + rect.height * 0.2, side * 0.6, rect.height * 0.45)
            CallFrameSlotShape.STAR -> around(side * 0.42, side * 0.42)
            CallFrameSlotShape.ARCH -> {
                val lift = min(rect.width / 2, rect.height) * 0.4
                CallFrameRect(rect.minX, rect.minY + lift, rect.width, rect.height - lift)
            }
            CallFrameSlotShape.TICKET, CallFrameSlotShape.STAMP ->
                CallFrameRect(rect.minX + side * 0.06, rect.minY + side * 0.06, rect.width - side * 0.12, rect.height - side * 0.12)
            CallFrameSlotShape.BLOB -> around(rect.width * 0.8, rect.height * 0.8)
            CallFrameSlotShape.TORN -> CallFrameRenderKit.inset(rect, side * 0.04)
            CallFrameSlotShape.POLAROID -> polaroidWindow(rect)
            CallFrameSlotShape.FRAME_OVAL -> {
                val medallion = medallionRect(rect)
                around(medallion.width * 0.82, medallion.height * 0.82)
            }
            CallFrameSlotShape.RECT, CallFrameSlotShape.ROUND -> rect
        }
    }
}
