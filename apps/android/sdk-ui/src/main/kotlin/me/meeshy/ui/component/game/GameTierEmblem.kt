package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import me.meeshy.sdk.model.game.EmblemPaint
import me.meeshy.sdk.model.game.EmblemShape
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.TierEmblemDesign
import kotlin.math.min

/** Le rang de 1 à 20 que lit [LevelTierPalette]. */
internal val LevelTierKey.rank: Int get() = ordinal + 1

private fun tierBrush(tier: LevelTierKey): Brush =
    if (LevelTierPalette.isSpectral(tier.rank)) {
        Brush.sweepGradient(*GamePalette.prismStops.toTypedArray(), center = Offset.Zero)
    } else {
        SolidColor(LevelTierPalette.color(tier.rank))
    }

/**
 * Dessine l'emblème de [tier] centré en [center], dans un carré de [side]. [knockout] est la couleur du disque
 * posé derrière : un cœur plein y creuse la Signature. [opacity] 1 est plein ; un filigrane se pose vers 0,18.
 * Miroir de `GameTierEmblem.draw` (iOS) : mêmes primitives, boîte de 100 centrée sur l'origine.
 */
public fun DrawScope.drawTierEmblem(
    tier: LevelTierKey,
    center: Offset,
    side: Float,
    knockout: Color,
    opacity: Float = 1f,
) {
    val design = TierEmblemDesign.of(tier)
    val brush = tierBrush(tier)
    val factor = side / TierEmblemDesign.BOX.toFloat()
    withTransform({
        translate(center.x, center.y)
        scale(factor, factor, pivot = Offset.Zero)
    }) {
        design.shapes.forEach { drawShape(it, brush, opacity) }
        val core = if (design.filledCore) knockout else LevelTierPalette.color(tier.rank)
        drawGameSignature(
            center = Offset.Zero,
            side = TierEmblemDesign.SIGNATURE_SIDE.toFloat(),
            color = core.copy(alpha = core.alpha * opacity),
            style = SignatureStyle.Flat,
            strokeWidth = 120f,
        )
    }
}

private fun DrawScope.drawShape(shape: EmblemShape, brush: Brush, opacity: Float) {
    val style = when (val paint = shape.paint) {
        EmblemPaint.Fill -> Fill
        is EmblemPaint.Stroke -> Stroke(paint.width.toFloat(), cap = StrokeCap.Round, join = StrokeJoin.Round)
    }
    when (shape) {
        is EmblemShape.Path -> drawPath(cachedGamePath(shape.d), brush, opacity, style)
        is EmblemShape.Circle ->
            drawCircle(brush, shape.r.toFloat(), Offset(shape.cx.toFloat(), shape.cy.toFloat()), opacity, style)
        is EmblemShape.Line -> drawLine(
            brush,
            Offset(shape.x1.toFloat(), shape.y1.toFloat()),
            Offset(shape.x2.toFloat(), shape.y2.toFloat()),
            shape.width.toFloat(),
            StrokeCap.Round,
            alpha = opacity,
        )
    }
}

/**
 * L'emblème d'un palier, seul, dans un carré qui prend toute la place offerte. [accessibilityLabel] nul :
 * décoratif ; l'hôte dit « palier Éclat ».
 */
@Composable
public fun TierEmblemView(
    tier: LevelTierKey,
    modifier: Modifier = Modifier,
    knockout: Color = Color.White,
    opacity: Float = 1f,
    accessibilityLabel: String? = null,
) {
    Canvas(modifier.aspectRatio(1f).gameAccessibility(accessibilityLabel)) {
        drawTierEmblem(tier, Offset(size.width / 2, size.height / 2), min(size.width, size.height), knockout, opacity)
    }
}
