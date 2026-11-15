package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.rememberTextMeasurer
import me.meeshy.sdk.model.game.GameMedalGeometry
import me.meeshy.ui.theme.MeeshyPalette

/** Les trois FORMES d'un badge : hexagone (accumulation), losange (record), médaillon (collection). */
public sealed interface GameBadgeShape {
    public data object Accumulation : GameBadgeShape
    public data object Record : GameBadgeShape

    /** [filled] pastilles pleines sur [total]. */
    public data class Collection(val filled: Int, val total: Int) : GameBadgeShape
}

public enum class GameBadgeState { Lit, Imprint }

private const val BOX = 72f
private val HEXAGON = cachedGamePath("M36 4 L64 20 L64 52 L36 68 L8 52 L8 20 Z")
private val DIAMOND = cachedGamePath("M36 3 L66 36 L36 69 L6 36 Z")

/**
 * Un badge historique (miroir de `GameBadgeView`) : trois formes qui disent la nature, sept matières qui disent
 * la hauteur. Éteint, il devient une EMPREINTE : contour en pointillé, Signature à plat éteinte, et ce qu'il
 * manque pour le rallumer (« −37 »). [accessibilityLabel] nul = décoratif ; l'hôte dit « Messages, Or ».
 */
@Composable
public fun GameBadgeView(
    material: GameMaterial,
    modifier: Modifier = Modifier,
    shape: GameBadgeShape = GameBadgeShape.Accumulation,
    state: GameBadgeState = GameBadgeState.Lit,
    label: String? = null,
    surface: Color = Color.White,
    muted: Color = Color.Gray,
    accent: Color = MeeshyPalette.Indigo500,
    accessibilityLabel: String? = null,
) {
    val measurer = rememberTextMeasurer()
    val typeScale = rememberGameTypeScale()
    val digit = typeScale.sp(8f).value
    Canvas(modifier.aspectRatio(1f).gameAccessibility(accessibilityLabel)) {
        val k = size.width / BOX
        scale(k, k, pivot = Offset.Zero) {
            when {
                state == GameBadgeState.Imprint -> drawBadgeImprint(label, muted, measurer, digit * 9f / 8f)
                shape is GameBadgeShape.Accumulation -> drawHexagon(material, label, measurer, digit)
                shape is GameBadgeShape.Record -> drawDiamond(label, measurer, digit)
                shape is GameBadgeShape.Collection -> drawMedallion(shape.filled, shape.total, surface, accent)
                else -> Unit
            }
        }
    }
}

private fun DrawScope.drawBadgeLabel(measurer: TextMeasurer, text: String?, color: Color, size: Float) {
    if (text != null) drawGameText(measurer, text, Offset(36f, 58f), size, color)
}

private fun DrawScope.drawHexagon(material: GameMaterial, label: String?, measurer: TextMeasurer, digit: Float) {
    val bounds = HEXAGON.getBounds()
    drawPath(HEXAGON, material.brush(bounds))
    drawPath(HEXAGON, GamePalette.ink.copy(alpha = 0.25f), style = Stroke(1f))
    drawGameSignature(Offset(36f, 32f), 34f, material.ink, SignatureStyle.Engraved, 100f)
    drawBadgeLabel(measurer, label, material.ink, digit)
}

private fun DrawScope.drawDiamond(label: String?, measurer: TextMeasurer, digit: Float) {
    val platinum = GameMaterial.PLATINUM
    drawPath(DIAMOND, platinum.brush(DIAMOND.getBounds()))
    drawPath(DIAMOND, GamePalette.ink.copy(alpha = 0.25f), style = Stroke(1f))
    drawGameSignature(Offset(36f, 36f), 34f, platinum.ink, SignatureStyle.Engraved, 100f)
    drawBadgeLabel(measurer, label, platinum.ink, digit)
}

private fun DrawScope.drawMedallion(filled: Int, total: Int, surface: Color, accent: Color) {
    drawCircle(GamePalette.diagonal(GamePalette.prismStops, Rect(5f, 5f, 67f, 67f)), radius = 31f, center = Offset(36f, 36f))
    drawCircle(surface, radius = 24f, center = Offset(36f, 36f))
    GameMedalGeometry.collectionDots(total).forEachIndexed { index, p ->
        val center = Offset(p.x.toFloat(), p.y.toFloat())
        if (index < filled) drawCircle(accent, radius = 3.6f, center = center)
        drawCircle(accent, radius = 3.6f, center = center, style = Stroke(1.4f))
    }
    drawGameSignature(Offset(36f, 36f), 22f, GamePalette.ink, SignatureStyle.Flat, 110f)
}

private fun DrawScope.drawBadgeImprint(label: String?, muted: Color, measurer: TextMeasurer, digit: Float) {
    drawPath(HEXAGON, muted, style = Stroke(width = 2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f))))
    drawGameSignature(Offset(36f, 32f), 34f, muted, SignatureStyle.Flat, 90f)
    drawBadgeLabel(measurer, label, muted, digit)
}
