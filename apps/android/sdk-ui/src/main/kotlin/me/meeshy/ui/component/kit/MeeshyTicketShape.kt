package me.meeshy.ui.component.kit

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection

/**
 * La découpe du billet (K30) : un rectangle arrondi dont deux disques sont retirés aux bords, à la hauteur de la coupe. Sans
 * coupe (`cutPx` nul, le mini), un simple rectangle arrondi.
 */
internal class MeeshyTicketShape(
    private val cornerPx: Float,
    private val notchDiameterPx: Float,
    private val cutPx: Float,
) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val body = Path().apply { addRoundRect(RoundRect(Rect(Offset.Zero, size), CornerRadius(cornerPx))) }
        if (cutPx <= 0f || cutPx >= size.height) return Outline.Generic(body)
        val radius = notchDiameterPx / 2f
        val notches = Path().apply {
            addOval(Rect(Offset(-radius, cutPx - radius), Size(notchDiameterPx, notchDiameterPx)))
            addOval(Rect(Offset(size.width - radius, cutPx - radius), Size(notchDiameterPx, notchDiameterPx)))
        }
        return Outline.Generic(Path.combine(PathOperation.Difference, body, notches))
    }
}
