package me.meeshy.app.stories

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import me.meeshy.feature.stories.R
import me.meeshy.ui.component.composer.ComposerPullDismiss
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions
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
 *
 * Une [sheet] ouverte (#13838) est ancrée en bas, sur toute la largeur, sans voile : sa hauteur mesurée réduit la scène de
 * la même façon, et seule la feuille parle — les surimpressions se retirent, toucher la scène ou glisser vers le bas
 * referme la feuille ([onSheetDismiss]), pas le compositeur.
 *
 * Pendant la frappe ([typing], #13835), aucune surimpression : la scène se réduit, entière, au-dessus d'une barre de style
 * collée au clavier, qui suit le clavier image par image sans relayout ; ses choix prennent la place du clavier.
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
    sheet: StoryComposerSheet? = null,
    onSheetDismiss: () -> Unit = {},
    sheetContent: @Composable (StoryComposerSheet) -> Unit = {},
    typing: StoryTypingSlot? = null,
) {
    val pull = rememberComposerPullDismiss(if (sheet != null) onSheetDismiss else onDismiss)
    val windowKeyboard = rememberWindowTypingKeyboard()
    val measures = remember {
        TypingMeasures(mutableFloatStateOf(0f), mutableFloatStateOf(ComposerKeyboardOrOptions.BAR_HEIGHT))
    }
    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .background(tint.color)
            .statusBarsPadding()
            .navigationBarsPadding()
            .then(if (typing == null) Modifier.imePadding().nestedScroll(pull.connection) else Modifier),
    ) {
        val windowHeight = maxHeight.value
        val sheetHeights = remember { mutableStateMapOf<StoryComposerSheet, Int>() }
        var frameBottom by remember { mutableFloatStateOf(0f) }
        var frameHeight by remember { mutableFloatStateOf(0f) }
        var frameWidth by remember { mutableFloatStateOf(0f) }
        var panelTop by remember { mutableFloatStateOf(Float.MAX_VALUE) }
        val sheetTop = sheet?.let { constraints.maxHeight - (sheetHeights[it] ?: 0) }?.toFloat()
        val overlap = when {
            sheetTop != null -> frameHeight - sheetTop
            reduced -> frameBottom - panelTop
            else -> 0f
        }.coerceAtLeast(0f)
        val framing = remember(sheetTop != null || reduced, frameWidth, frameHeight, overlap) {
            sceneFraming(sheetTop != null || reduced, frameWidth, frameHeight, overlap)
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
            val keyboard = typing?.keyboard ?: windowKeyboard
            scene(
                if (typing != null) {
                    Modifier.typingScene(typing, keyboard, measures, { frameWidth to frameHeight }, windowHeight)
                } else {
                    Modifier.fillMaxSize().graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        translationY = offsetY
                    }
                },
            )
            if (typing != null) {
                TypingKeyboardWatcher(typing, keyboard, measures)
            } else if (sheet != null) {
                SheetDismissCatcher(onSheetDismiss)
            } else {
                SceneOverlays(pull, top, strip, trailing, panel = panel, onPanelTop = { panelTop = it }, socle = socle)
            }
        }
        typing?.let { TypingDock(it, it.keyboard ?: windowKeyboard, measures, windowHeight) }
        AnchoredSheetHost(sheet.takeIf { typing == null }, maxHeight * SHEET_MAX_FRACTION, sheetHeights, sheetContent)
    }
}

/** La feuille ouverte, ancrée en bas sur toute la largeur et sans voile : sa hauteur mesurée réduit la scène au-dessus d'elle. */
@Composable
private fun BoxScope.AnchoredSheetHost(
    sheet: StoryComposerSheet?,
    maxHeight: Dp,
    heights: MutableMap<StoryComposerSheet, Int>,
    content: @Composable (StoryComposerSheet) -> Unit,
) {
    AnimatedContent(
        targetState = sheet,
        transitionSpec = {
            slideInVertically { it } togetherWith slideOutVertically { it } using SizeTransform(clip = false)
        },
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .heightIn(max = maxHeight),
        label = "composerSheet",
    ) { open ->
        if (open != null) {
            Box(Modifier.fillMaxWidth().onSizeChanged { heights[open] = it.height }) { content(open) }
        }
    }
}

/** Les contrôles du geste en cours, posés sur la scène : la barre du haut (qui se tire pour fermer), la colonne, le panneau et le socle. */
@Composable
private fun SceneOverlays(
    pull: ComposerPullDismiss,
    top: @Composable () -> Unit,
    strip: @Composable () -> Unit,
    trailing: @Composable ColumnScope.() -> Unit,
    panel: @Composable () -> Unit,
    onPanelTop: (Float) -> Unit,
    socle: @Composable ColumnScope.() -> Unit,
) {
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
        Box(modifier = Modifier.fillMaxWidth().onGloballyPositioned { onPanelTop(it.positionInRoot().y) }) { panel() }
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xs),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            content = socle,
        )
    }
}

/** Une feuille ouverte : toucher la scène, au-dessus d'elle, la referme — sans voile ni ondulation, la scène reste lisible. */
@Composable
private fun SheetDismissCatcher(onSheetDismiss: () -> Unit) {
    val label = stringResource(R.string.composer_sheet_dismiss)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onSheetDismiss)
            .semantics {
                contentDescription = label
                role = Role.Button
            },
    )
}

/** La part de la hauteur utile qu'une feuille peut prendre : la scène garde toujours de quoi se lire au-dessus. */
private const val SHEET_MAX_FRACTION = 0.55f

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
