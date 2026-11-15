package me.meeshy.ui.component.game

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.game.RarityBorder

/** La couleur franche du liseré ; `null` pour le prisme, qui est un dégradé tournant ([rimBrush]). */
public val RarityBorder.rimColor: Color?
    get() = when (this) {
        RarityBorder.Slate -> GamePalette.raritySlate
        RarityBorder.Blue -> GamePalette.rarityBlue
        RarityBorder.Violet -> GamePalette.rarityViolet
        RarityBorder.Gold -> GamePalette.rarityGold
        RarityBorder.Prism -> null
    }

/** Le trait du liseré : une couleur franche, ou le prisme tournant du mythique. */
public fun RarityBorder.rimBrush(center: Offset): Brush {
    val color = rimColor
    return if (color != null) {
        Brush.linearGradient(listOf(color, color))
    } else {
        Brush.sweepGradient(*GamePalette.prismStops.toTypedArray(), center = center)
    }
}

/**
 * Pose le liseré de rareté d'un succès (ardoise, bleu, violet, or, prisme). `null` (rareté non mesurée) ne pose
 * rien : un succès sans mesure vaut un commun, et le commun reste sobre.
 */
public fun Modifier.gameRarityRim(border: RarityBorder?, cornerRadius: Dp = 14.dp): Modifier =
    if (border == null) {
        this
    } else {
        drawWithContent {
            drawContent()
            val width = 1.5.dp.toPx()
            val half = width / 2f
            drawRoundRect(
                brush = border.rimBrush(Offset(size.width / 2f, size.height / 2f)),
                topLeft = Offset(half, half),
                size = Size(size.width - width, size.height - width),
                cornerRadius = CornerRadius((cornerRadius.toPx() - half).coerceAtLeast(0f)),
                style = Stroke(width),
            )
        }
    }
