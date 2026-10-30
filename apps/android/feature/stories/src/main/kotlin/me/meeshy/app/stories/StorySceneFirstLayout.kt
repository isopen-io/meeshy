package me.meeshy.app.stories

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.StoryCanvasFraming
import me.meeshy.ui.component.composer.rememberComposerPullDismiss
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.PlateauTint

/**
 * La disposition du compositeur de story, « la scène d'abord » (#13834, maquette du 2026-10-30) — elle remplace, pour
 * la story, la géographie « aucun contrôle sur la scène » de #4561/#4633 : la scène 9:16 prend la plus grande taille qui
 * tient dans la fenêtre (barres système et clavier déduits), bord à bord et sans carte, et les seuls contrôles du geste en
 * cours sont posés DESSUS — [top] et [strip] en haut, [trailing] à droite, [panel] puis [socle] en bas.
 *
 * Les surimpressions sont du chrome de l'éditeur : la capture d'export n'enregistre que la scène, et chacune ne consomme
 * que ses propres touchers — hors d'elles, la scène garde ses gestes. [reduced] (un panneau monte) réduit la scène, ENTIÈRE,
 * au-dessus du panneau par [StoryCanvasFraming] (échelle et décalage en `graphicsLayer`, sans relayout) ; elle n'est
 * jamais couverte. Un glissé vers le bas de la barre du haut, ou le reste d'un défilement, ferme comme la croix.
 */
@Composable
internal fun StorySceneFirstLayout(
    onDismiss: () -> Unit,
    reduced: Boolean,
    scene: @Composable (Modifier) -> Unit,
    top: @Composable () -> Unit,
    trailing: @Composable ColumnScope.() -> Unit,
    panel: @Composable () -> Unit,
    socle: @Composable ColumnScope.() -> Unit,
    modifier: Modifier = Modifier,
    strip: @Composable () -> Unit = {},
    tint: PlateauTint = PlateauTint.DEFAULT,
) {
    val pull = rememberComposerPullDismiss(onDismiss)
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(tint.color)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .nestedScroll(pull.connection),
    ) {
        var frameBottom by remember { mutableFloatStateOf(0f) }
        var frameHeight by remember { mutableFloatStateOf(0f) }
        var frameWidth by remember { mutableFloatStateOf(0f) }
        var panelTop by remember { mutableFloatStateOf(Float.MAX_VALUE) }
        val framing = remember(reduced, frameWidth, frameHeight, frameBottom, panelTop) {
            sceneFraming(reduced, frameWidth, frameHeight, overlap = (frameBottom - panelTop).coerceAtLeast(0f))
        }
        val scale by animateFloatAsState(framing.scale, label = "sceneFirstScale")
        val offsetY by animateFloatAsState(framing.offsetY, label = "sceneFirstOffset")
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .aspectRatio(StoryCanvasFraming.PORTRAIT_RATIO)
                .onGloballyPositioned {
                    frameWidth = it.size.width.toFloat()
                    frameHeight = it.size.height.toFloat()
                    frameBottom = it.positionInRoot().y + frameHeight
                },
        ) {
            scene(
                Modifier.fillMaxSize().graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationY = offsetY
                },
            )
            Column(modifier = Modifier.fillMaxSize().padding(OVERLAY_INSET)) {
                Box(
                    modifier = Modifier.fillMaxWidth().draggable(
                        orientation = Orientation.Vertical,
                        state = rememberDraggableState { deltaPx -> pull.onDrag(deltaPx) },
                        onDragStopped = { velocityPx -> pull.onRelease(velocityPx) },
                    ),
                ) { top() }
                strip()
                Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    Spacer(Modifier.weight(1f))
                    Column(
                        modifier = Modifier.fillMaxHeight().padding(top = MeeshySpacing.xs),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                        content = trailing,
                    )
                }
                Box(modifier = Modifier.fillMaxWidth().onGloballyPositioned { panelTop = it.positionInRoot().y }) { panel() }
                Column(
                    modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xs),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                    content = socle,
                )
            }
        }
    }
}

private val OVERLAY_INSET = 10.dp

private fun sceneFraming(reduced: Boolean, width: Float, height: Float, overlap: Float): StoryCanvasFraming.Result =
    StoryCanvasFraming.resolve(
        StoryCanvasFraming.Input(
            viewportWidth = width,
            viewportHeight = height,
            headerInset = 0f,
            bottomInset = if (reduced) overlap else 0f,
            presentation = if (reduced) StoryCanvasFraming.Presentation.CARDED else StoryCanvasFraming.Presentation.FREE,
            cardedCornerRadius = 0f,
            verticalAlignment = StoryCanvasFraming.VerticalAlignment.TOP,
        ),
    )
