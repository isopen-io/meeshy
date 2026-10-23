package me.meeshy.ui.appearance

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.clipPath
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import me.meeshy.sdk.model.appearance.BannerFrameDesign
import me.meeshy.sdk.model.appearance.BannerFrameElement
import me.meeshy.sdk.model.appearance.BannerFrameFillRule
import me.meeshy.sdk.model.appearance.BannerFrameRenderer
import me.meeshy.sdk.model.appearance.FrameGradient
import me.meeshy.sdk.model.appearance.FrameMotionPlan
import me.meeshy.sdk.model.appearance.SvgPathData

/*
 * Le dessin d'un cadre de bannière (#10935, miroir de `BannerFrameRenderer.swift`) : la géométrie vient de
 * `:core:model`, ceci ne fait que la PEINDRE. Tout est préparé UNE fois par (cadre, taille, sens de lecture) —
 * chemins placés, pinceaux, découpe —, de sorte que la boucle d'animation n'alloue rien.
 */

/** Un élément prêt à peindre : son chemin placé dans le repère logique (x ∈ [0, W], y ∈ [0, 100]) et ses pinceaux. */
internal class BannerFramePaintedElement(
    val path: Path,
    val color: Color,
    val brush: Brush?,
    val opacity: Float,
    val strokeWidth: Float?,
)

internal class BannerFrameScene private constructor(
    val design: BannerFrameDesign,
    val logicalWidth: Double,
    val widthPx: Int,
    val heightPx: Int,
    val plan: FrameMotionPlan,
    private val elements: List<BannerFramePaintedElement>,
    private val band: BannerFramePaintedElement,
    private val filets: List<BannerFramePaintedElement>,
    private val clipLogical: Path,
) {
    /** Le facteur du repère logique (hauteur 100) vers les pixels. */
    val pxPerUnit: Float = heightPx / BannerFrameDesign.HEIGHT.toFloat()

    /** La découpe en pixels : le centre transparent est GARANTI par elle, pour le dessin fixe comme pour les couches. */
    val clipPx: Path by lazy {
        Path().also { it.addPath(clipLogical); it.transform(Matrix().apply { scale(pxPerUnit, pxPerUnit) }) }
    }

    /** Le dessin fixe sous la découpe ; les éléments de [skipping] vivent dans les couches animées. */
    fun DrawScope.drawStill(skipping: Set<Int>) {
        clipPath(clipPx) {
            scale(pxPerUnit, pxPerUnit, pivot = Offset.Zero) {
                paint(band)
                filets.forEach { paint(it) }
                elements.forEachIndexed { index, element -> if (index !in skipping) paint(element) }
            }
        }
    }

    /** Les éléments désignés, dans le repère logique (la boîte des couches animées l'a déjà mis à l'échelle). */
    fun DrawScope.drawElements(indices: List<Int>) {
        indices.forEach { index -> elements.getOrNull(index)?.let { paint(it) } }
    }

    /** Le dessin fixe rasterisé UNE fois, aux pixels de la taille. */
    fun rasterize(density: Density, direction: LayoutDirection): ImageBitmap {
        val bitmap = ImageBitmap(widthPx, heightPx)
        CanvasDrawScope().draw(density, direction, Canvas(bitmap), Size(widthPx.toFloat(), heightPx.toFloat())) {
            drawStill(plan.animated)
        }
        return bitmap
    }

    private fun DrawScope.paint(element: BannerFramePaintedElement) {
        val style = element.strokeWidth?.let { Stroke(width = it) }
        val brush = element.brush
        when {
            brush != null && style != null -> drawPath(element.path, brush, element.opacity, style)
            brush != null -> drawPath(element.path, brush, element.opacity)
            style != null -> drawPath(element.path, element.color, element.opacity, style)
            else -> drawPath(element.path, element.color, element.opacity)
        }
    }

    companion object {
        fun make(design: BannerFrameDesign, widthPx: Int, heightPx: Int, mirrored: Boolean): BannerFrameScene {
            val logical = BannerFrameRenderer.logicalWidth(widthPx.toDouble(), heightPx.toDouble())
            val placed = BannerFrameRenderer.elements(design, logical, mirrored)
            return BannerFrameScene(
                design = design,
                logicalWidth = logical,
                widthPx = widthPx,
                heightPx = heightPx,
                plan = BannerFrameRenderer.plan(design, logical, mirrored),
                elements = placed.map { paintedElement(design, it) },
                band = borderBand(design, logical),
                filets = design.border.filets.map { filet(design, it, logical) },
                clipLogical = clipRegion(design, logical),
            )
        }

        private fun palette(design: BannerFrameDesign, index: Int): Color =
            appearanceHexColor(design.palette.getOrNull(index) ?: "#000000")

        private fun brush(design: BannerFrameDesign, gradient: Int?, bounds: androidx.compose.ui.geometry.Rect): Brush? {
            val readable: FrameGradient = gradient?.let { design.gradients.getOrNull(it) } ?: return null
            val stops = readable.stops.map { stop ->
                val color = palette(design, stop.color)
                stop.at.toFloat() to color.copy(alpha = color.alpha * (stop.opacity ?: 1.0).toFloat())
            }.toTypedArray()
            return Brush.linearGradient(
                *stops,
                start = Offset(bounds.left + (readable.x1 * bounds.width).toFloat(), bounds.top + (readable.y1 * bounds.height).toFloat()),
                end = Offset(bounds.left + (readable.x2 * bounds.width).toFloat(), bounds.top + (readable.y2 * bounds.height).toFloat()),
            )
        }

        private fun paintedElement(design: BannerFrameDesign, element: BannerFrameElement): BannerFramePaintedElement {
            val source = element.path
            val path = Path().also { target ->
                SvgPathData.parse(source.d).toComposePath().let { raw ->
                    target.addPath(raw)
                    target.transform(Matrix().apply {
                        values[Matrix.ScaleX] = element.sx.toFloat()
                        values[Matrix.TranslateX] = element.tx.toFloat()
                    })
                }
                target.fillType = if (source.fillRule == BannerFrameFillRule.EVENODD) PathFillType.EvenOdd else PathFillType.NonZero
            }
            val bounds = path.getBounds()
            return BannerFramePaintedElement(
                path = path,
                color = palette(design, source.color),
                brush = brush(design, source.gradient, bounds),
                opacity = source.opacity.toFloat(),
                strokeWidth = source.width?.toFloat(),
            )
        }

        private fun borderBand(design: BannerFrameDesign, width: Double): BannerFramePaintedElement {
            val border = design.border
            val path = Path().apply {
                fillType = PathFillType.EvenOdd
                addRect(androidx.compose.ui.geometry.Rect(0f, 0f, width.toFloat(), BannerFrameDesign.HEIGHT.toFloat()))
                val inner = border.width.toFloat()
                addRect(
                    androidx.compose.ui.geometry.Rect(
                        inner, inner, (width - border.width).toFloat(), (BannerFrameDesign.HEIGHT - border.width).toFloat(),
                    ),
                )
            }
            return BannerFramePaintedElement(
                path = path,
                color = palette(design, border.color),
                brush = brush(design, border.gradient, path.getBounds()),
                opacity = border.opacity.toFloat(),
                strokeWidth = null,
            )
        }

        private fun filet(
            design: BannerFrameDesign,
            filet: me.meeshy.sdk.model.appearance.BannerFrameFilet,
            width: Double,
        ): BannerFramePaintedElement {
            val inset = filet.inset.toFloat()
            val path = Path().apply {
                addRect(
                    androidx.compose.ui.geometry.Rect(
                        inset, inset, (width - filet.inset).toFloat(), (BannerFrameDesign.HEIGHT - filet.inset).toFloat(),
                    ),
                )
            }
            return BannerFramePaintedElement(
                path = path,
                color = palette(design, filet.color),
                brush = brush(design, filet.gradient, path.getBounds()),
                opacity = filet.opacity.toFloat(),
                strokeWidth = filet.width.toFloat(),
            )
        }

        /** La découpe du cadre en `Path` à enroulement non nul (le trou anti-horaire s'annule). */
        private fun clipRegion(design: BannerFrameDesign, width: Double): Path = Path().also { path ->
            path.fillType = PathFillType.NonZero
            BannerFrameRenderer.clip(design, width).contours.forEach { contour ->
                contour.points.forEachIndexed { index, point ->
                    if (index == 0) path.moveTo(point.x.toFloat(), point.y.toFloat()) else path.lineTo(point.x.toFloat(), point.y.toFloat())
                }
                path.close()
            }
        }
    }
}
