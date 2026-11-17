package me.meeshy.ui.component.kit

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas

/**
 * Désature tout ce que l'élément dessine : 1 garde la couleur, 0 la retire. Le pendant de `.saturation(_:)` (SwiftUI) pour ce
 * que la recette déclare périmé : une recette qui annonce une désaturation la fait voir par ce modificateur, jamais seule.
 */
internal fun Modifier.meeshySaturation(saturation: Float): Modifier {
    if (saturation >= 1f) return this
    val paint = Paint().apply { colorFilter = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(saturation.coerceIn(0f, 1f)) }) }
    return drawWithContent {
        drawIntoCanvas { canvas ->
            canvas.saveLayer(Rect(0f, 0f, size.width, size.height), paint)
            drawContent()
            canvas.restore()
        }
    }
}
