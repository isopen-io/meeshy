package me.meeshy.sdk.model.call.frames

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/** Un nœud d'un réseau : sa position, sa rangée et sa colonne. */
public data class CallFrameLatticePoint(val x: Double, val y: Double, val row: Int, val col: Int)

/** Un point du périmètre et le côté (0 haut, 1 droite, 2 bas, 3 gauche) qui le porte. */
public data class CallFramePerimeterPoint(val x: Double, val y: Double, val side: Int)

/** Un coin et le sens dans lequel on entre dans le rectangle depuis lui. */
public data class CallFrameCorner(val x: Double, val y: Double, val sx: Double, val sy: Double)

/**
 * LES OUTILS COMMUNS DES PEINTRES DE CADRE — le miroir de `frame-paint-kit.ts` et de
 * `CallFrameRenderer+Kit.swift` : hasard déterministe, couleurs, réseaux, périmètres, coins, densités.
 * Tout est pur : la même graine donne le même dessin à chaque image, sur chaque plateforme.
 */
public object CallFrameRenderKit {
    public const val TAU: Double = CallFramePathOp.TAU

    /** Le hasard d'un cadre : une graine par ornement, une valeur par tirage — le même aperçu à chaque image. */
    public fun rand(seed: Double, draw: Double): Double =
        CallFrameLayoutGeometry.scatter(seed * 97.13 + draw * 7.31 + 0.5)

    private val BLACK = CallFrameColor(0.0, 0.0, 0.0, 1.0)

    /** Une couleur de cadre ; une graphie illisible tombe sur le noir, comme `CallFrameColor.cg` d'iOS. */
    public fun color(hex: String, alpha: Double = 1.0): CallFrameColor {
        val parsed = CallFrameColor.parse(hex) ?: BLACK
        return parsed.copy(alpha = parsed.alpha * alpha)
    }

    /** La couleur avec son alpha multiplié par [alpha] borné à 0…1. */
    public fun tint(hex: String, alpha: Double = 1.0): CallFrameColor = color(hex, max(0.0, min(1.0, alpha)))

    /** Mélange deux couleurs (0 = la première), alpha compris. */
    public fun mix(from: String, to: String, share: Double): CallFrameColor {
        val a = CallFrameColor.parse(from) ?: BLACK
        val b = CallFrameColor.parse(to) ?: BLACK
        fun at(x: Double, y: Double) = x + (y - x) * share
        return CallFrameColor(at(a.red, b.red), at(a.green, b.green), at(a.blue, b.blue), at(a.alpha, b.alpha))
    }

    /** La luminance perçue (0 noir, 1 blanc) — celle de `frame-paint-kit.ts`, sans linéarisation. */
    public fun perceived(hex: String): Double {
        val c = CallFrameColor.parse(hex) ?: return 0.0
        return 0.2126 * c.red + 0.7152 * c.green + 0.0722 * c.blue
    }

    public fun densityScale(density: CallFrameDensity): Double = when (density) {
        CallFrameDensity.LOW -> 0.5
        CallFrameDensity.MID -> 1.0
        CallFrameDensity.HIGH -> 1.8
    }

    public fun count(base: Double, density: CallFrameDensity): Int =
        max(1, (base * densityScale(density)).roundHalfAway())

    /** Un réseau de nœuds couvrant [width] × [height] ; une rangée sur deux décalée d'un demi-pas si [stagger]. */
    public fun lattice(width: Double, height: Double, step: Double, stagger: Boolean): List<CallFrameLatticePoint> {
        if (step <= 0) return emptyList()
        val cols = kotlin.math.ceil(width / step).toInt() + 2
        val rows = kotlin.math.ceil(height / step).toInt() + 2
        return (0 until cols * rows).map { index ->
            val row = index / cols
            val col = index % cols
            val shift = if (stagger && row % 2 == 1) step / 2 else 0.0
            CallFrameLatticePoint((col - 0.5) * step + shift, (row - 0.5) * step, row, col)
        }
    }

    public fun corners(frame: CallFrameRect): List<CallFrameCorner> = listOf(
        CallFrameCorner(frame.minX, frame.minY, 1.0, 1.0),
        CallFrameCorner(frame.maxX, frame.minY, -1.0, 1.0),
        CallFrameCorner(frame.maxX, frame.maxY, -1.0, -1.0),
        CallFrameCorner(frame.minX, frame.maxY, 1.0, -1.0),
    )

    /** Des points également répartis le long du périmètre de [frame], espacés d'environ [step]. */
    public fun perimeter(frame: CallFrameRect, step: Double): List<CallFramePerimeterPoint> {
        data class Side(val x: Double, val y: Double, val dx: Double, val dy: Double)
        val sides = listOf(
            Side(frame.minX, frame.minY, frame.width, 0.0),
            Side(frame.maxX, frame.minY, 0.0, frame.height),
            Side(frame.maxX, frame.maxY, -frame.width, 0.0),
            Side(frame.minX, frame.maxY, 0.0, -frame.height),
        )
        return sides.flatMapIndexed { index, side ->
            val length = hypot(side.dx, side.dy)
            val count = max(1, (length / max(step, 0.0001)).roundHalfAway())
            (0 until count).map { at ->
                CallFramePerimeterPoint(
                    side.x + side.dx * at / count,
                    side.y + side.dy * at / count,
                    index,
                )
            }
        }
    }

    public fun inset(rect: CallFrameRect, by: Double): CallFrameRect =
        CallFrameRect(rect.minX + by, rect.minY + by, max(0.0, rect.width - by * 2), max(0.0, rect.height - by * 2))

    /** L'encombrement d'une case une fois tournée autour de son centre — ce qu'un ornement de premier plan évite. */
    public fun footprint(box: CallFrameSlotBox): CallFrameRect {
        val radians = abs(box.rotation) * kotlin.math.PI / 180
        val halfX = (box.rect.width * cos(radians) + box.rect.height * sin(radians)) / 2
        val halfY = (box.rect.width * sin(radians) + box.rect.height * cos(radians)) / 2
        return CallFrameRect(box.rect.midX - halfX, box.rect.midY - halfY, halfX * 2, halfY * 2)
    }

    /** Le rectangle du visage dans sa case : la case entière, ou l'intérieur de la carte (marge `pad`, pied `foot`). */
    public fun photoRect(box: CallFrameRect, card: CallFrameCard?): CallFrameRect {
        if (card == null) return box
        val side = min(box.width, box.height)
        val pad = card.pad * side
        val foot = card.foot * side
        return CallFrameRect(
            box.minX + pad,
            box.minY + pad,
            max(0.0, box.width - pad * 2),
            max(0.0, box.height - pad * 2 - foot),
        )
    }

    /** L'arrondi « demi vers l'extérieur » de Swift (`rounded()`), que `roundToInt` ne donne pas pour les négatifs. */
    internal fun Double.roundHalfAway(): Int = if (this < 0) -((-this).roundToInt()) else roundToInt()
}
