package me.meeshy.app.stories

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties

/**
 * Où s'ouvre le menu « … » d'un plein écran (#14347) : son bord de FIN sur celui du bouton, sous lui, ou au-dessus quand la
 * place manque. Le bord du bouton est à l'écran, donc le menu aussi — même quand la fenêtre plein écran (sans limites, sous
 * les barres système) annonce une largeur plus grande que l'écran, ce qui faisait sortir le menu standard par la droite.
 */
internal class EndAnchoredMenuPosition(private val gapPx: Int) : PopupPositionProvider {
    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
        val x = if (layoutDirection == LayoutDirection.Ltr) {
            (anchorBounds.right - popupContentSize.width).coerceAtLeast(0)
        } else {
            anchorBounds.left.coerceIn(0, maxOf(0, windowSize.width - popupContentSize.width))
        }
        val below = anchorBounds.bottom + gapPx
        val y = if (below + popupContentSize.height <= windowSize.height) below else (anchorBounds.top - gapPx - popupContentSize.height).coerceAtLeast(0)
        return IntOffset(x, y)
    }
}

/** Le menu « … » d'un plein écran, ancré à la fin de son bouton ([EndAnchoredMenuPosition]), avec la surface d'un menu Material. */
@Composable
internal fun SceneOverflowMenu(
    expanded: Boolean,
    onDismissRequest: () -> Unit,
    position: (gapPx: Int) -> PopupPositionProvider = ::EndAnchoredMenuPosition,
    content: @Composable ColumnScope.() -> Unit,
) {
    if (!expanded) return
    val gap = with(LocalDensity.current) { MENU_GAP.roundToPx() }
    val provider = remember(gap, position) { position(gap) }
    Popup(popupPositionProvider = provider, onDismissRequest = onDismissRequest, properties = PopupProperties(focusable = true)) {
        Surface(
            shape = MaterialTheme.shapes.extraSmall,
            color = MaterialTheme.colorScheme.surfaceContainer,
            tonalElevation = 3.dp,
            shadowElevation = 3.dp,
        ) {
            Column(Modifier.width(IntrinsicSize.Max).padding(vertical = 8.dp), content = content)
        }
    }
}

private val MENU_GAP = 4.dp
