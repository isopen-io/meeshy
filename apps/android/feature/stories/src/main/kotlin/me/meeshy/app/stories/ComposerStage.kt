package me.meeshy.app.stories

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.StoryCanvasFraming

/**
 * The composer's stage (#12298): the [scene] takes every row the [footer] (caption, drawing
 * or text settings, media row) leaves, and the open tool [panel] slides OVER the bottom of the
 * stage instead of pushing the scene into a thumbnail — iOS `ComposerRailGeometry.sceneWidth`
 * depends on the usable width only, never on the band. Nothing is laid on the scene itself.
 *
 * [carded] (#12347, iOS `canvasIsCarded`) : dès qu'un panneau réduit la zone visible, le
 * canevas se réduit en carte ENTIÈRE dans la région que le panneau laisse libre — jamais un bas
 * masqué. Le solveur pur [StoryCanvasFraming] rend l'échelle et le décalage ; le clavier est déjà
 * absorbé par la fenêtre réelle (`imePadding` de l'hôte), donc la scène reçoit sa vraie hauteur.
 */
@Composable
internal fun ComposerStage(
    scene: @Composable (Modifier) -> Unit,
    footer: @Composable ColumnScope.() -> Unit,
    panel: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    carded: Boolean = false,
) {
    var sceneTop by remember { mutableFloatStateOf(0f) }
    var sceneSize by remember { mutableStateOf(IntSize.Zero) }
    var panelTop by remember { mutableFloatStateOf(Float.MAX_VALUE) }
    val overlap = (sceneTop + sceneSize.height - panelTop).coerceAtLeast(0f)
    val framing = remember(carded, sceneSize, overlap) {
        StoryCanvasFraming.resolve(
            StoryCanvasFraming.Input(
                viewportWidth = sceneSize.width.toFloat(),
                viewportHeight = sceneSize.height.toFloat(),
                headerInset = 0f,
                bottomInset = overlap,
                presentation = if (carded) {
                    StoryCanvasFraming.Presentation.CARDED
                } else {
                    StoryCanvasFraming.Presentation.FREE
                },
                cardedCornerRadius = 0f,
                verticalAlignment = StoryCanvasFraming.VerticalAlignment.TOP,
            ),
        )
    }
    val scale by animateFloatAsState(framing.scale, label = "canvasCardScale")
    val offsetY by animateFloatAsState(framing.offsetY, label = "canvasCardOffset")
    Box(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .onGloballyPositioned {
                        sceneTop = it.positionInRoot().y
                        sceneSize = it.size
                    },
            ) {
                scene(
                    Modifier.fillMaxSize().graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        translationY = offsetY
                    },
                )
            }
            footer()
        }
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .onGloballyPositioned { panelTop = it.positionInRoot().y },
        ) {
            panel()
        }
    }
}
