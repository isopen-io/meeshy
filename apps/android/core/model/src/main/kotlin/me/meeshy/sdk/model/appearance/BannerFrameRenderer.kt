package me.meeshy.sdk.model.appearance

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/*
 * BannerFrameRenderer (#10935) — MIROIR de `packages/shared/utils/banner-frame-svg.ts` et de
 * `BannerFrameRenderer.swift` : la géométrie PURE d'un cadre de bannière, posé SUR la photo ou le fond.
 * À la largeur LOGIQUE `W = largeur × 100 / hauteur`, la bordure et ses filets se tracent à `W`, les pièces
 * restent à leur ancrage, les frises répètent leur module (`repeat` : modules entiers centrés ; `justify` :
 * module recalculé). Les FRISES se peignent d'abord, les PIÈCES ensuite : un coin ou un cartouche couvre la
 * frise qui court dessous. La découpe ([clip]) garantit le centre transparent. Sur divergence, le TypeScript
 * a raison.
 */

/** `x' = tx + sx × x` : l'ancrage d'une pièce, la place (et l'échelle) d'un module de frise. */
data class BannerFrameElement(
    val path: BannerFramePath,
    val tx: Double,
    val sx: Double,
    val bounds: FrameBounds?,
)

/** Un contour fermé de la découpe : horaire (repère écran) il ajoute +1 à l'enroulement, anti-horaire il retranche 1. */
data class BannerFrameContour(val points: List<FramePoint>)

/** La découpe d'un cadre : des contours à enroulement NON NUL. Un point est dedans si l'enroulement n'est pas nul. */
data class BannerFrameClip(val contours: List<BannerFrameContour>) {

    fun windingNumber(x: Double, y: Double): Int = contours.sumOf { winding(it.points, x, y) }

    fun covers(x: Double, y: Double): Boolean = windingNumber(x, y) != 0

    private fun winding(points: List<FramePoint>, x: Double, y: Double): Int {
        var count = 0
        points.indices.forEach { index ->
            val a = points[index]
            val b = points[(index + 1) % points.size]
            val crossing = (a.y <= y) != (b.y <= y) && x < a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x)
            if (crossing) count += if (b.y > a.y) 1 else -1
        }
        return count
    }
}

object BannerFrameRenderer {

    const val HEIGHT: Double = BannerFrameDesign.HEIGHT
    private const val TEMPLATE_WIDTH: Double = BannerFrameDesign.REFERENCE_WIDTH

    fun logicalWidth(width: Double, height: Double): Double =
        if (height > 0.0) width * HEIGHT / height else TEMPLATE_WIDTH

    /**
     * Les éléments à peindre, frises d'abord puis pièces. [mirrored] (lecture de droite à gauche) reflète
     * chaque élément dans la largeur : `x' = width − (tx + sx × x)`.
     */
    fun elements(design: BannerFrameDesign, width: Double, mirrored: Boolean = false): List<BannerFrameElement> {
        val pieces = design.pieces.flatMap { piece ->
            val shift = when (piece.anchor) {
                BannerFrameAnchor.START -> 0.0
                BannerFrameAnchor.CENTER -> (width - TEMPLATE_WIDTH) / 2
                BannerFrameAnchor.END -> width - TEMPLATE_WIDTH
            }
            piece.paths.map { element(it, shift, 1.0, width, mirrored) }
        }
        val friezes = design.friezes.flatMap { frieze ->
            instances(frieze, width).flatMap { (tx, sx) -> frieze.paths.map { element(it, tx, sx, width, mirrored) } }
        }
        return friezes + pieces
    }

    private fun instances(frieze: BannerFrameFrieze, width: Double): List<Pair<Double, Double>> {
        val span = width - frieze.from - frieze.to
        if (frieze.module <= 0.0 || span < frieze.module) return emptyList()
        return when (frieze.fit) {
            BannerFrameFit.REPEAT -> {
                val count = floor(span / frieze.module).toInt()
                val offset = (span - count * frieze.module) / 2
                List(count) { (offset + it * frieze.module) to 1.0 }
            }
            BannerFrameFit.JUSTIFY -> {
                val count = max(1, (span / frieze.module).roundToInt())
                val scale = span / (count * frieze.module)
                List(count) { (frieze.from + it * frieze.module * scale - frieze.from * scale) to scale }
            }
        }
    }

    private fun element(path: BannerFramePath, tx: Double, sx: Double, width: Double, mirrored: Boolean): BannerFrameElement {
        val placedTx = if (mirrored) width - tx else tx
        val placedSx = if (mirrored) -sx else sx
        val raw = controlBounds(SvgPathData.parse(path.d))
        val bounds = raw?.let {
            val a = placedTx + placedSx * it.minX
            val b = placedTx + placedSx * it.maxX
            FrameBounds(min(a, b), it.minY, max(a, b), it.maxY)
        }
        return BannerFrameElement(path, placedTx, placedSx, bounds)
    }

    /** La boîte des points du chemin, points de contrôle compris (`boundingBoxOfPath`) ; `null` sans aucun point. */
    private fun controlBounds(segments: List<SvgSegment>): FrameBounds? {
        val xs = ArrayList<Double>()
        val ys = ArrayList<Double>()
        fun add(x: Double, y: Double) {
            xs += x
            ys += y
        }
        segments.forEach { segment ->
            when (segment) {
                is SvgSegment.MoveTo -> add(segment.x, segment.y)
                is SvgSegment.LineTo -> add(segment.x, segment.y)
                is SvgSegment.CubicTo -> {
                    add(segment.x1, segment.y1)
                    add(segment.x2, segment.y2)
                    add(segment.x, segment.y)
                }
                is SvgSegment.QuadTo -> {
                    add(segment.cx, segment.cy)
                    add(segment.x, segment.y)
                }
                SvgSegment.Close -> Unit
            }
        }
        if (xs.isEmpty()) return null
        return FrameBounds(xs.min(), ys.min(), xs.max(), ys.max())
    }

    /**
     * LA DÉCOUPE, à enroulement non nul : le pourtour horaire, le trou anti-horaire (il s'annule), les coins
     * et le cartouche horaires. Tout ce que le cadre peint est découpé là : aucun pixel dans le centre.
     */
    fun clip(design: BannerFrameDesign, width: Double): BannerFrameClip {
        val region = design.drawableRegion(width)
        val outer = rectangle(region.outer, clockwise = true)
        val hole = rectangle(region.hole, clockwise = false)
        return BannerFrameClip(listOf(outer, hole) + region.reserved.map { rectangle(it, clockwise = true) })
    }

    private fun rectangle(rect: FrameRect, clockwise: Boolean): BannerFrameContour {
        val corners = listOf(
            FramePoint(rect.x, rect.y),
            FramePoint(rect.x + rect.width, rect.y),
            FramePoint(rect.x + rect.width, rect.y + rect.height),
            FramePoint(rect.x, rect.y + rect.height),
        )
        return BannerFrameContour(if (clockwise) corners else corners.reversed())
    }

    /** Le plan des couches animées ; sans mouvement déclaré, [FrameMotionPlan.STILL]. */
    fun plan(design: BannerFrameDesign, width: Double, mirrored: Boolean = false): FrameMotionPlan {
        if (design.motion.isEmpty()) return FrameMotionPlan.STILL
        return FrameMotionPlan.make(
            elements = elements(design, width, mirrored).map { FrameMotionElement(it.path.group, it.bounds) },
            motions = design.motion,
            center = FramePoint(width / 2, HEIGHT / 2),
        )
    }
}
