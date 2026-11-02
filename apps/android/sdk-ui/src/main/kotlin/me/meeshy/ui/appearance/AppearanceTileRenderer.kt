package me.meeshy.ui.appearance

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import me.meeshy.sdk.model.appearance.AppearanceDesign
import me.meeshy.sdk.model.appearance.AppearanceDesignPalette
import me.meeshy.sdk.model.appearance.AppearanceDesignStroke
import me.meeshy.sdk.model.appearance.AppearanceDesignTile
import me.meeshy.sdk.model.appearance.AppearanceScheme
import me.meeshy.sdk.model.appearance.AppearanceTilePlan

/**
 * Le rendu d'une tuile de motif (spec § 8.2) : hors écran, déterministe, depuis les MÊMES chemins que le web
 * et iOS (`SvgPathData`). Les nombres du contrat sont en unités de tuile ; l'échelle du modèle agrandit la
 * tuile, jamais l'épaisseur seule.
 */
internal object AppearanceTileRenderer {

    fun tileImage(
        design: AppearanceDesign,
        scheme: AppearanceScheme,
        accentHex: String,
        density: Float,
        cache: AppearanceTileCache = AppearanceTileCache.shared,
    ): ImageBitmap? {
        val tile = design.tile ?: return null
        val key = AppearanceTilePlan.key(design, scheme, accentHex, density.toDouble())
        return cache.image(key) { render(tile, design.palette(scheme), accentHex, density) }
    }

    private fun render(tile: AppearanceDesignTile, palette: AppearanceDesignPalette, accentHex: String, density: Float): ImageBitmap {
        val (width, height) = AppearanceTilePlan.pixelSize(tile, density.toDouble())
        val bitmap = ImageBitmap(width, height)
        val factor = (tile.scale * density).toFloat()
        CanvasDrawScope().draw(Density(density), LayoutDirection.Ltr, Canvas(bitmap), Size(width.toFloat(), height.toFloat())) {
            drawRect(appearanceHexColor(palette.base))
            withTransform({ scale(factor, factor, Offset.Zero) }) {
                tile.paths.forEach { drawStroke(it, palette, accentHex) }
            }
        }
        return bitmap
    }

    fun DrawScope.drawStroke(stroke: AppearanceDesignStroke, palette: AppearanceDesignPalette, accentHex: String) {
        val color = appearanceColor(stroke.role, palette, accentHex).let { it.copy(alpha = it.alpha * stroke.opacity.toFloat()) }
        val path = svgComposePath(stroke.d)
        val width = stroke.width
        if (width != null) drawPath(path, color, style = Stroke(width = width.toFloat())) else drawPath(path, color)
    }
}
