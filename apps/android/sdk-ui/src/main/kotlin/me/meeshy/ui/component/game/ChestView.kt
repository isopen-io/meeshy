package me.meeshy.ui.component.game

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * Le coffre du jour, interpolé par `openProgress` (miroir de `ChestView.swift`, #9380) : le dôme se fond dans le
 * couvercle levé, qui monte de 3 unités, et les trois étincelles d'or apparaissent avec lui.
 */
internal data class ChestPlan(
    val closedLidAlpha: Float,
    val openLidAlpha: Float,
    val openLidOffsetY: Float,
    val sparklesAlpha: Float,
) {
    companion object {
        const val WIDTH: Float = 90f
        const val HEIGHT: Float = 72f
        const val CLOSED_LID_D: String = "M10 34 a35 22 0 0 1 70 0 z"
        const val OPEN_LID_D: String = "M20 30 l-6 -20 62 0 -6 20"
        const val SPARKLES_D: String = "M30 18 l-4 -8 M45 14 V4 M60 18 l4 -8"
        const val OPEN_LID_OPACITY: Float = 0.85f
        const val LIFT: Float = 3f

        fun of(openProgress: Float): ChestPlan {
            val p = openProgress.coerceIn(0f, 1f)
            return ChestPlan(1f - p, p, LIFT * (p - 1f), p)
        }
    }
}

/**
 * Le coffre : fermé en dôme (0), ouvert le couvercle levé et trois étincelles d'or (1). La brique ne décide ni
 * quand il s'ouvre ni ce qui en sort : l'hôte pilote [openProgress], qui s'anime (fondu sous « Réduire les
 * animations »). [accessibilityLabel] nul : décoratif.
 */
@Composable
public fun ChestView(
    openProgress: Float,
    modifier: Modifier = Modifier,
    accessibilityLabel: String? = null,
) {
    val reduce = LocalReduceMotion.current
    val shown by animateFloatAsState(
        targetValue = openProgress.coerceIn(0f, 1f),
        animationSpec = if (reduce) snap() else tween(350),
        label = "chest-open",
    )
    val plan = ChestPlan.of(shown)
    Canvas(modifier.aspectRatio(ChestPlan.WIDTH / ChestPlan.HEIGHT).gameAccessibility(accessibilityLabel)) {
        val k = size.width / ChestPlan.WIDTH
        withTransform({ scale(k, k, pivot = Offset.Zero) }) {
            drawPath(cachedGamePath(ChestPlan.CLOSED_LID_D), GamePalette.violet, alpha = plan.closedLidAlpha)
            withTransform({ translate(0f, plan.openLidOffsetY) }) {
                drawPath(
                    cachedGamePath(ChestPlan.OPEN_LID_D),
                    GamePalette.violet.copy(alpha = ChestPlan.OPEN_LID_OPACITY),
                    alpha = plan.openLidAlpha,
                )
                drawPath(
                    cachedGamePath(ChestPlan.SPARKLES_D),
                    GamePalette.gold,
                    alpha = plan.sparklesAlpha,
                    style = Stroke(width = 2f, cap = StrokeCap.Round),
                )
            }
            drawChestBody()
        }
    }
}

private fun DrawScope.drawChestBody() {
    val body = Rect(Offset(10f, 30f), Size(70f, 36f))
    drawRoundRect(GamePalette.diagonal(GamePalette.indigo, body), body.topLeft, body.size, CornerRadius(6f))
    val band = Rect(Offset(10f, 30f), Size(70f, 6f))
    drawRect(GameMaterial.GOLD.brush(band), band.topLeft, band.size)
    val lock = Rect(Offset(35f, 36f), Size(20f, 16f))
    drawRoundRect(GameMaterial.GOLD.brush(lock), lock.topLeft, lock.size, CornerRadius(3f))
    drawGameSignature(Offset(45f, 44f), 15f, GameMaterial.GOLD.ink, SignatureStyle.Engraved, 120f)
}
