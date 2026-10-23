package me.meeshy.ui.component.game

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import java.util.concurrent.ConcurrentHashMap

private val parsedPaths = ConcurrentHashMap<String, Path>()

/** Un tracé SVG lu une fois : les médailles se redessinent à chaque image, jamais le texte du chemin. */
internal fun cachedGamePath(d: String): Path = parsedPaths.getOrPut(d) { GameSvgPath.make(d) }

/** Un texte centré sur [center], corps en unités de la boîte de dessin (le canevas est déjà mis à l'échelle). */
internal fun DrawScope.drawGameText(
    measurer: TextMeasurer,
    text: String,
    center: Offset,
    size: Float,
    color: Color,
    weight: FontWeight = FontWeight.Medium,
    family: FontFamily = FontFamily.Monospace,
) {
    val layout = measurer.measure(text, TextStyle(fontSize = size.toSp(), fontWeight = weight, fontFamily = family))
    drawText(layout, color = color, topLeft = Offset(center.x - layout.size.width / 2f, center.y - layout.size.height / 2f))
}
