package me.meeshy.ui.component.game

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke

private val CROWN_POINTS = listOf(
    -8f to 0f, -9f to -9f, -4f to -4f, 0f to -11f, 4f to -4f, 9f to -9f, 8f to 0f,
)

/** Pièces héraldiques communes (miroir de `GameHeraldry`) : une couronne d'or posée sur une tête, `head` est où elle repose. */
internal fun DrawScope.drawGameCrown(head: Offset, scale: Float = 1f) {
    val crown = Path()
    CROWN_POINTS.forEachIndexed { index, (dx, dy) ->
        val x = head.x + dx * scale
        val y = head.y + dy * scale
        if (index == 0) crown.moveTo(x, y) else crown.lineTo(x, y)
    }
    crown.close()
    val bounds = crown.getBounds()
    drawPath(crown, GameMaterial.GOLD.brush(bounds))
    drawPath(crown, GamePalette.ink.copy(alpha = 0.35f), style = Stroke(0.8f * scale))
}

/** Une auréole d'or au-dessus d'une tête. */
internal fun DrawScope.drawGameHalo(head: Offset, scale: Float = 1f) {
    val box = Rect(Offset(head.x - 10f * scale, head.y - 4.5f * scale), Size(20f * scale, 6f * scale))
    drawOval(GamePalette.gold, topLeft = box.topLeft, size = box.size, style = Stroke(2.2f * scale))
}
