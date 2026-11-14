package me.meeshy.ui.component.kit

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyMediaChromeColors

/**
 * Les deux estompes de bord d'une rangée qui défile, en fraction de leur largeur (0 : absente, 1 : entière). Elles
 * s'animent sur 150 ms et ne changent qu'au seuil de [MeeshyScrollEdges] : défiler ne redessine que le masque.
 */
internal class EdgeFades(
    val start: Animatable<Float, AnimationVector1D>,
    val end: Animatable<Float, AnimationVector1D>,
)

/**
 * **L'estompe d'une rangée qui déborde** : opaque au milieu, transparent sur [MeeshyChipRecipe.EDGE_FADE_DP] du bord
 * derrière lequel il reste des puces, jamais du côté déjà atteint, jamais s'il y a tout. C'est un MASQUE posé sur le dessin
 * de la fenêtre : il ne prend aucun toucher et ne change rien à l'accessibilité (une puce à demi effacée reste une cible
 * entière). Sans débordement, aucun calque hors écran n'est ouvert. [isRightToLeft] miroite les bords : le début de la
 * lecture est alors à droite.
 */
internal fun Modifier.fadingEdges(fades: EdgeFades, isRightToLeft: Boolean): Modifier = drawWithContent {
    val start = fades.start.value
    val end = fades.end.value
    if (start <= 0f && end <= 0f) {
        drawContent()
        return@drawWithContent
    }
    val width = size.width
    val fade = MeeshyChipRecipe.EDGE_FADE_DP.dp.toPx()
    val low = (if (isRightToLeft) end else start) * fade / width
    val high = (if (isRightToLeft) start else end) * fade / width
    val stops = arrayOf(
        0f to (if (low > 0f) Color.Transparent else MASK_OPAQUE),
        low.coerceAtMost(HALF) to MASK_OPAQUE,
        (1f - high).coerceAtLeast(HALF) to MASK_OPAQUE,
        1f to (if (high > 0f) Color.Transparent else MASK_OPAQUE),
    )
    drawIntoCanvas { it.saveLayer(Rect(0f, 0f, size.width, size.height), Paint()) }
    drawContent()
    drawRect(brush = Brush.horizontalGradient(colorStops = stops), blendMode = BlendMode.DstIn)
    drawIntoCanvas { it.restore() }
}

private const val HALF: Float = 0.5f

/** Un masque ne lit que l'opacité : n'importe quelle couleur pleine y fait (la même que le voile de la courante). */
private val MASK_OPAQUE: Color = MeeshyMediaChromeColors.OnMedia
