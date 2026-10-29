package me.meeshy.app.game.reveal

import androidx.compose.foundation.border
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.game.engagement.RarityBorder
import me.meeshy.ui.component.game.GamePalette

/** La couleur franche du liseré (miroir de `RarityBorder.stroke`, iOS) ; `null` pour le prisme, qui est un balayage. */
internal fun RarityBorder.solidColor(): Color? = when (this) {
    RarityBorder.Slate -> Color(0xFF94A3B8)
    RarityBorder.Blue -> Color(0xFF3B82F6)
    RarityBorder.Violet -> Color(0xFF8B5CF6)
    RarityBorder.Gold -> Color(0xFFF59E0B)
    RarityBorder.Prism -> null
}

/** Le trait du liseré : une couleur franche, ou le prisme du mythique. */
internal fun RarityBorder.brush(): Brush =
    solidColor()?.let { Brush.linearGradient(listOf(it, it)) } ?: Brush.sweepGradient(*GamePalette.prismStops.toTypedArray())

/** Pose le liseré de rareté ; `null` (rareté non mesurée) ne pose rien — un succès sans mesure vaut un commun, et le commun reste sobre. */
internal fun Modifier.rarityRim(border: RarityBorder?, shape: Shape): Modifier =
    if (border == null) this else this.border(1.5.dp, border.brush(), shape)
