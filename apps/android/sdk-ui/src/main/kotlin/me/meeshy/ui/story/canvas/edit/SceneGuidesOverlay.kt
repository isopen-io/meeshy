package me.meeshy.ui.story.canvas.edit

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyPalette

/** Les traits du repère de manipulation, en points iOS (= dp). */
public object SceneGuideStyle {
    public const val OUTLINE_ALPHA: Float = 0.9f
    public val OUTLINE_WIDTH: Dp = 2.dp
    public const val MAGNETIC_ALPHA: Float = 0.3f
    public val MAGNETIC_WIDTH: Dp = 0.5.dp
    public val ENGAGED_WIDTH: Dp = 1.dp
}

/**
 * Les limites et les lignes magnétiques, peintes SEULEMENT pendant un geste (miroir de
 * `StoryCanvasUIView+Limits` et de `updateSnapGuides`) : le contour de la scène (blanc 90 %, 2 pt) là où le
 * contenu se coupe, les lignes sur lesquelles l'objet s'accroche (blanc 30 %, 0,5 pt, pointillé), et la ligne
 * ENGAGÉE en rose 1 pt. Au repos ([active] faux), rien ne se peint : pas de grille permanente.
 *
 * Les lignes sont des fractions `0..1` du côté qu'elles coupent ; [engagedVertical] / [engagedHorizontal]
 * sont les lignes sur lesquelles le centre est verrouillé.
 */
@Composable
public fun SceneGuidesOverlay(
    active: Boolean,
    verticalLines: List<Float>,
    horizontalLines: List<Float>,
    engagedVertical: Float?,
    engagedHorizontal: Float?,
    cornerRadius: Dp,
    modifier: Modifier = Modifier,
) {
    if (!active) return
    Canvas(modifier.fillMaxSize()) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val dash = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 6.dp.toPx()))
        val magnetic = MeeshyPalette.White.copy(alpha = SceneGuideStyle.MAGNETIC_ALPHA)
        verticalLines.forEach { f ->
            drawLine(magnetic, Offset(f * size.width, 0f), Offset(f * size.width, size.height), SceneGuideStyle.MAGNETIC_WIDTH.toPx(), pathEffect = dash)
        }
        horizontalLines.forEach { f ->
            drawLine(magnetic, Offset(0f, f * size.height), Offset(size.width, f * size.height), SceneGuideStyle.MAGNETIC_WIDTH.toPx(), pathEffect = dash)
        }
        val inset = 1.dp.toPx()
        drawRoundRect(
            color = MeeshyPalette.White.copy(alpha = SceneGuideStyle.OUTLINE_ALPHA),
            topLeft = Offset(inset, inset),
            size = Size(size.width - 2 * inset, size.height - 2 * inset),
            cornerRadius = CornerRadius((cornerRadius.toPx() - inset).coerceAtLeast(0f)),
            style = Stroke(SceneGuideStyle.OUTLINE_WIDTH.toPx()),
        )
        val engaged = MeeshyPalette.TileRose
        engagedVertical?.let { f ->
            drawLine(engaged, Offset(f * size.width, 0f), Offset(f * size.width, size.height), SceneGuideStyle.ENGAGED_WIDTH.toPx())
        }
        engagedHorizontal?.let { f ->
            drawLine(engaged, Offset(0f, f * size.height), Offset(size.width, f * size.height), SceneGuideStyle.ENGAGED_WIDTH.toPx())
        }
    }
}
