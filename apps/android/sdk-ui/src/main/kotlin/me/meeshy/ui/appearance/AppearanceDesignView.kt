package me.meeshy.ui.appearance

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.ImageShader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.LayoutDirection
import me.meeshy.sdk.model.appearance.AppearanceDesign
import me.meeshy.sdk.model.appearance.AppearanceDesignGradient
import me.meeshy.sdk.model.appearance.AppearanceDesignPalette
import me.meeshy.sdk.model.appearance.AppearanceDesignScene
import me.meeshy.sdk.model.appearance.AppearanceDesignStyle
import me.meeshy.sdk.model.appearance.AppearanceScheme
import me.meeshy.sdk.model.appearance.AppearanceSceneLayout
import me.meeshy.sdk.model.appearance.AppearanceTilePlan
import me.meeshy.sdk.model.appearance.GradientAngle

/**
 * Un fond ou une bannière de design (spec §§ 5.1, 8.2) — building block AGNOSTIQUE, miroir d'`AppearanceDesignView` :
 * il prend un [AppearanceDesign], le schéma et l'accent effectif, et peint ; jamais de décision « quel fond, quand »
 * (l'orchestration est côté app). Motif : une tuile rendue une fois (cache borné) puis répétée ; illustration et
 * dégradé : un seul `Canvas`. Décoratif : masqué aux lecteurs d'écran.
 */
@Composable
public fun AppearanceDesignView(
    design: AppearanceDesign,
    isDark: Boolean,
    accentHex: String,
    modifier: Modifier = Modifier,
) {
    val scheme = if (isDark) AppearanceScheme.DARK else AppearanceScheme.LIGHT
    val palette = design.palette(scheme)
    Box(
        modifier = modifier
            .clipToBounds()
            .background(appearanceHexColor(palette.base))
            .clearAndSetSemantics { },
    ) {
        when (design.style) {
            AppearanceDesignStyle.PATTERN -> PatternLayer(design, scheme, accentHex)
            AppearanceDesignStyle.ILLUSTRATION -> design.scene?.let { IllustrationLayer(it, palette, accentHex) }
            AppearanceDesignStyle.GRADIENT -> design.gradient?.let { GradientLayer(it, palette, accentHex) }
        }
    }
}

@Composable
private fun PatternLayer(design: AppearanceDesign, scheme: AppearanceScheme, accentHex: String) {
    val tile = design.tile ?: return
    val density = LocalDensity.current.density
    val image = remember(design, scheme, accentHex, density) {
        AppearanceTileRenderer.tileImage(design, scheme, accentHex, density)
    } ?: return
    val brush = remember(image) { ShaderBrush(ImageShader(image, TileMode.Repeated, TileMode.Repeated)) }
    val spread = AppearanceTilePlan.spread(tile).toFloat()
    Canvas(Modifier.fillMaxSize()) {
        // Une rotation découvre des coins : la couche est agrandie de la diagonale, puis rognée.
        val layerWidth = size.width * spread
        val layerHeight = size.height * spread
        val left = (size.width - layerWidth) / 2
        val top = (size.height - layerHeight) / 2
        rotate(tile.rotation.toFloat(), pivot = center) {
            withTransform({ translate(left, top) }) {
                drawRect(brush, size = androidx.compose.ui.geometry.Size(layerWidth, layerHeight))
            }
        }
    }
}

@Composable
private fun IllustrationLayer(scene: AppearanceDesignScene, palette: AppearanceDesignPalette, accentHex: String) {
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val paths = remember(scene) { scene.paths.map { svgComposePath(it.d) } }
    Canvas(Modifier.fillMaxSize()) {
        val frame = AppearanceSceneLayout.frame(scene, size.width.toDouble(), size.height.toDouble(), isRtl)
        val factor = frame.scale.toFloat()
        withTransform({
            translate(frame.originX.toFloat(), frame.originY.toFloat())
            scale(factor, factor, Offset.Zero)
        }) {
            scene.paths.forEachIndexed { index, stroke ->
                val color = appearanceColor(stroke.role, palette, accentHex).let { it.copy(alpha = it.alpha * stroke.opacity.toFloat()) }
                val width = stroke.width
                if (width != null) drawPath(paths[index], color, style = Stroke(width = width.toFloat())) else drawPath(paths[index], color)
            }
        }
    }
}

@Composable
private fun GradientLayer(gradient: AppearanceDesignGradient, palette: AppearanceDesignPalette, accentHex: String) {
    Canvas(Modifier.fillMaxSize()) { drawGradient(gradient, palette, accentHex) }
}

private fun DrawScope.drawGradient(gradient: AppearanceDesignGradient, palette: AppearanceDesignPalette, accentHex: String) {
    val axis = GradientAngle.axis(gradient.angle)
    val stops = gradient.stops
        .map { it.at.toFloat() to appearanceColor(it.role, palette, accentHex) }
        .toTypedArray()
    drawRect(
        Brush.linearGradient(
            *stops,
            start = Offset((axis.startX * size.width).toFloat(), (axis.startY * size.height).toFloat()),
            end = Offset((axis.endX * size.width).toFloat(), (axis.endY * size.height).toFloat()),
        ),
    )
    val reach = maxOf(size.width, size.height)
    gradient.blobs.forEach { blob ->
        val color = appearanceColor(blob.role, palette, accentHex)
        val blobCenter = Offset((blob.x * size.width).toFloat(), (blob.y * size.height).toFloat())
        val radius = (blob.r * reach).toFloat()
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(color.copy(alpha = blob.opacity.toFloat()), color.copy(alpha = 0f)),
                center = blobCenter,
                radius = radius,
            ),
            radius = radius,
            center = blobCenter,
        )
    }
}
