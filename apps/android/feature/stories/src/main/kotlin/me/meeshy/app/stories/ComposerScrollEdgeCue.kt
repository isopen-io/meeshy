package me.meeshy.app.stories

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Ce qu'un rail qui défile cache encore, de chaque côté (iOS `ComposerScrollEdges`, #14666) : en haut ce qui a été défilé,
 * en bas ce qui reste à défiler.
 */
internal data class ComposerScrollEdges(val top: Boolean, val bottom: Boolean) {
    companion object {
        fun of(state: ScrollState): ComposerScrollEdges =
            ComposerScrollEdges(top = state.canScrollBackward, bottom = state.canScrollForward)
    }
}

/** La hauteur du fondu, celle d'iOS (`ComposerScrollEdgeCue.fade`, 28 pt). */
internal val COMPOSER_SCROLL_EDGE_FADE: Dp = 28.dp

/**
 * Un rail du compositeur qui déborde le montre (iOS `ComposerScrollEdgeCue`, #14666) : il défile selon [state], et le bord
 * derrière lequel des entrées attendent s'efface en fondu sur [COMPOSER_SCROLL_EDGE_FADE] ; le fondu se retire dès que ce
 * bord est atteint. C'est un MASQUE posé sur le dessin du viewport : il ne prend aucun toucher et ne change rien à
 * l'accessibilité — une entrée à demi effacée reste une cible entière.
 */
internal fun Modifier.composerScrollEdgeCue(state: ScrollState): Modifier = this
    .drawWithContent {
        val edges = ComposerScrollEdges.of(state)
        if (!edges.top && !edges.bottom) {
            drawContent()
            return@drawWithContent
        }
        val fade = (COMPOSER_SCROLL_EDGE_FADE.toPx() / size.height).coerceAtMost(0.5f)
        val stops = buildList {
            add((0f to if (edges.top) Color.Transparent else Color.Black))
            if (edges.top) add(fade to Color.Black)
            if (edges.bottom) add(1f - fade to Color.Black)
            add(1f to if (edges.bottom) Color.Transparent else Color.Black)
        }
        // Le masque n'efface que le rail : son calque isole ce qu'il dessine de ce qui est dessous.
        drawIntoCanvas { it.saveLayer(Rect(0f, 0f, size.width, size.height), Paint()) }
        drawContent()
        drawRect(brush = Brush.verticalGradient(*stops.toTypedArray()), blendMode = BlendMode.DstIn)
        drawIntoCanvas { it.restore() }
    }
    .verticalScroll(state)
