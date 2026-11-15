package me.meeshy.ui.component.retouch

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.testTag
import me.meeshy.sdk.model.imageedit.CropRect

/** Le voile rond de l'avatar (#17257). */
public const val ENTITY_ROUND_VEIL_TAG: String = "retouch.entity.roundVeil"

/**
 * **Le rond de l'avatar, posé sur la scène carrée** (#17257, miroir de l'iOS `EntityImageRoundVeil`) : ce qui tombe hors
 * du cercle inscrit dans [display] est voilé — on cadre son visage comme les autres le verront. Ni toucher ni lecteur
 * d'écran : c'est un repère, pas un contrôle.
 */
@Composable
internal fun EntityImageRoundVeil(display: CropRect) {
    Canvas(Modifier.fillMaxSize().clearAndSetSemantics { testTag = ENTITY_ROUND_VEIL_TAG }) {
        val diameter = minOf(display.width, display.height)
        if (diameter <= 0f) return@Canvas
        val circle = Rect(
            Offset(display.left + (display.width - diameter) / 2f, display.top + (display.height - diameter) / 2f),
            Size(diameter, diameter),
        )
        val veil = Path().apply {
            fillType = PathFillType.EvenOdd
            addRect(Rect(Offset(display.left, display.top), Size(display.width, display.height)))
            addOval(circle)
        }
        drawPath(veil, VEIL_COLOR)
        drawOval(RIM_COLOR, circle.topLeft, circle.size, style = Stroke(width = RIM_WIDTH_DP * density))
    }
}

private val VEIL_COLOR = Color.Black.copy(alpha = 0.55f)
private val RIM_COLOR = Color.White.copy(alpha = 0.85f)
private const val RIM_WIDTH_DP = 1.5f
