package me.meeshy.app.stories

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
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
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.input.pointer.pointerInput
import me.meeshy.feature.stories.R
import me.meeshy.ui.accessibility.LocalReduceMotion
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
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.layout.width
import me.meeshy.sdk.model.composer.ComposerSceneArrangement
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
 *
 * Grand écran (#13837) : quand la fenêtre laisse à côté de la scène la place de deux rails libellés
 * ([ComposerSceneArrangement], jamais le modèle d'appareil), [rails] remplace la barre du haut, la colonne et le socle :
 * la scène prend toute la hauteur, Publier posé sous elle, entre le rail de ce qu'on ajoute et celui de la sélection
 * (inversés en arabe). Les rails se taisent pendant la frappe ou une feuille, sans libérer leur place. La bascule ne
 * touche que la disposition : la scène reste le même nœud, et rien de l'état ne se perd.
 *
 * Un ajout en cours ([incoming], R5 de #13863) voile le reste : outils, socle, rails et Publier s'estompent, ne prennent
 * plus aucun toucher et sortent de TalkBack ; seul l'espace réservé du média, posé à l'échelle de la scène, reste vivant.
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
    rails: StorySceneRails? = null,
    incoming: (@Composable () -> Unit)? = null,
    clearsTrailingLane: Boolean = false,
) {
    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .background(tint.color)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        val arrangement = rememberSceneArrangement(maxWidth, maxHeight, offered = rails != null)
        val onRails = rails != null && arrangement == ComposerSceneArrangement.RAILS
        val railsServe = typing == null && sheet == null
        val busy = incoming != null
        Row(Modifier.fillMaxSize()) {
            if (onRails) LabeledRailSlot(busy) { if (railsServe) rails?.leading?.invoke(this) }
            Box(Modifier.weight(1f).fillMaxHeight().padding(top = if (onRails) RAIL_MARGIN else 0.dp)) {
                SceneFirstStage(
                    onDismiss = onDismiss,
                    reduced = reduced,
                    scene = scene,
                    overlays = SceneOverlaySlots(
                        top = if (onRails) NoOverlay else top,
                        strip = strip,
                        trailing = if (onRails) NoColumn else trailing,
                        panel = panel,
                        socle = if (onRails) rails?.socle ?: NoColumn else socle,
                    ),
                    reservesBelow = onRails,
                    below = rails?.below?.takeIf { onRails && railsServe },
                    sheet = sheet,
                    onSheetDismiss = onSheetDismiss,
                    sheetContent = sheetContent,
                    typing = typing,
                    incoming = incoming,
                    clearsTrailingLane = clearsTrailingLane && !onRails,
                )
            }
            if (onRails) LabeledRailSlot(busy) { if (railsServe) rails?.trailing?.invoke(this) }
        }
    }
}

/**
 * Ce que le grand écran range autour de la scène (#13837) : [leading] le rail de ce qu'on ajoute, [trailing] celui de
 * la sélection, [socle] ce qui reste posé au bas de la scène (un message de l'éditeur) et [below] Publier, sous la scène. La disposition ne les sert que si la place libre le permet.
 */
internal class StorySceneRails(
    val leading: @Composable ColumnScope.() -> Unit,
    val trailing: @Composable ColumnScope.() -> Unit,
    val socle: @Composable ColumnScope.() -> Unit,
    val below: @Composable () -> Unit,
)

private class SceneOverlaySlots(
    val top: @Composable () -> Unit,
    val strip: @Composable () -> Unit,
    val trailing: @Composable ColumnScope.() -> Unit,
    val panel: @Composable () -> Unit,
    val socle: @Composable ColumnScope.() -> Unit,
)

private val NoOverlay: @Composable () -> Unit = {}
private val NoColumn: @Composable ColumnScope.() -> Unit = {}

/**
 * La disposition que la fenêtre permet, relue à chaque changement de taille (rotation, multi-fenêtre, pliage) : la loi
 * reçoit la disposition en place, pour que l'hystérésis empêche un redimensionnement de la faire clignoter.
 */
@Composable
private fun rememberSceneArrangement(width: Dp, height: Dp, offered: Boolean): ComposerSceneArrangement {
    val memory = remember { ArrangementMemory() }
    if (!offered) return ComposerSceneArrangement.OVERLAY
    return remember(width, height) {
        ComposerSceneArrangement.resolve(width.value, height.value, memory.last).also { memory.last = it }
    }
}

private class ArrangementMemory(var last: ComposerSceneArrangement? = null)

/** Un rail libellé : sa largeur fixe et ses marges, quel que soit ce qu'il porte à cet instant ; voilé et inerte pendant un ajout ([busy]). */
@Composable
private fun LabeledRailSlot(busy: Boolean, content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.width(ComposerSceneArrangement.RAIL_WIDTH.dp).fillMaxHeight()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .veiledWhen(busy)
                .padding(vertical = RAIL_MARGIN, horizontal = MeeshySpacing.xs),
            content = content,
        )
        if (busy) TouchShield()
    }
}

/**
 * La scène et ce qui se pose sur elle. Sur les rails ([reservesBelow]), la place de Publier est réservée sous la scène,
 * même quand une feuille ou la frappe le retirent, pour que la scène ne saute pas ; [below] s'y pose, à la largeur de la
 * scène ou au moins à [BELOW_MIN_WIDTH].
 */
@Composable
private fun SceneFirstStage(
    onDismiss: () -> Unit,
    reduced: Boolean,
    scene: @Composable (Modifier) -> Unit,
    overlays: SceneOverlaySlots,
    reservesBelow: Boolean,
    below: (@Composable () -> Unit)?,
    sheet: StoryComposerSheet?,
    onSheetDismiss: () -> Unit,
    sheetContent: @Composable (StoryComposerSheet) -> Unit,
    typing: StoryTypingSlot?,
    incoming: (@Composable () -> Unit)? = null,
    clearsTrailingLane: Boolean = false,
) {
    val busy = incoming != null
    val pull = rememberComposerPullDismiss(if (sheet != null) onSheetDismiss else onDismiss)
    val windowKeyboard = rememberWindowTypingKeyboard()
    val measures = remember {
        TypingMeasures(mutableFloatStateOf(0f), mutableFloatStateOf(ComposerKeyboardOrOptions.BAR_HEIGHT))
    }
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .then(if (typing == null) Modifier.imePadding().nestedScroll(pull.connection) else Modifier),
    ) {
        val windowHeight = maxHeight.value
        val sheetHeights = remember { mutableStateMapOf<StoryComposerSheet, Int>() }
        var frameBottom by remember { mutableFloatStateOf(0f) }
        var frameHeight by remember { mutableFloatStateOf(0f) }
        var frameWidth by remember { mutableFloatStateOf(0f) }
        var frameRight by remember { mutableFloatStateOf(0f) }
        var trailingLeft by remember { mutableFloatStateOf(Float.MAX_VALUE) }
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
        val gutter = with(LocalDensity.current) { LANE_GUTTER.toPx() }
        val lane = if (clearsTrailingLane && typing == null && sheet == null) (frameRight - trailingLeft + gutter).coerceAtLeast(0f) else 0f
        val cleared = framing.clearingTrailingLane(lane, frameWidth, frameHeight)
        val reduceMotion = LocalReduceMotion.current
        val scale by animateFloatAsState(cleared.scale, ComposerSceneMotion.spec(reduceMotion), label = "sceneFirstScale")
        val offsetY by animateFloatAsState(cleared.offsetY, ComposerSceneMotion.spec(reduceMotion), label = "sceneFirstOffset")
        val offsetX by animateFloatAsState(cleared.offsetX, ComposerSceneMotion.spec(reduceMotion), label = "sceneFirstOffsetX")
        val reserve = if (reservesBelow) BELOW_RESERVE else 0.dp
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(bottom = reserve)
                .aspectRatio(StoryCanvasFraming.PORTRAIT_RATIO)
                .onGloballyPositioned {
                    frameWidth = it.size.width.toFloat()
                    frameHeight = it.size.height.toFloat()
                    frameBottom = it.positionInRoot().y + frameHeight
                    frameRight = it.positionInRoot().x + frameWidth
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
                        translationX = offsetX
                        translationY = offsetY
                    }
                }.then(if (busy) Modifier.clearAndSetSemantics {} else Modifier),
            )
            if (typing != null) {
                TypingKeyboardWatcher(typing, keyboard, measures)
            } else if (sheet != null) {
                SheetDismissCatcher(onSheetDismiss)
            } else {
                SceneOverlays(pull, overlays, onPanelTop = { panelTop = it }, onTrailingLeft = { trailingLeft = it }, veiled = busy)
            }
            incoming?.let { placeholder ->
                TouchShield()
                Box(
                    Modifier.fillMaxSize().graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        translationX = offsetX
                        translationY = offsetY
                    },
                ) { placeholder() }
            }
        }
        below?.let { content -> BelowScene(frameWidth, frameHeight) { Box(Modifier.veiledWhen(busy)) { content() }; if (busy) TouchShield() } }
        typing?.let { TypingDock(it, it.keyboard ?: windowKeyboard, measures, windowHeight) }
        AnchoredSheetHost(sheet.takeIf { typing == null }, maxHeight * SHEET_MAX_FRACTION, sheetHeights, sheetContent)
    }
}

/** Publier sous la scène (grand écran) : à la largeur de la scène, ou au moins à [BELOW_MIN_WIDTH]. */
@Composable
private fun BoxScope.BelowScene(frameWidthPx: Float, frameHeightPx: Float, content: @Composable BoxScope.() -> Unit) {
    val frame = with(LocalDensity.current) { DpSize(frameWidthPx.toDp(), frameHeightPx.toDp()) }
    Box(
        modifier = Modifier
            .align(Alignment.TopCenter)
            .padding(top = frame.height + BELOW_GAP)
            .width(maxOf(frame.width, BELOW_MIN_WIDTH)),
    ) { content() }
}

/** La feuille ouverte, ancrée en bas sur toute la largeur et sans voile : sa hauteur mesurée réduit la scène au-dessus d'elle. */
@Composable
private fun BoxScope.AnchoredSheetHost(
    sheet: StoryComposerSheet?,
    maxHeight: Dp,
    heights: MutableMap<StoryComposerSheet, Int>,
    content: @Composable (StoryComposerSheet) -> Unit,
) {
    val reduceMotion = LocalReduceMotion.current
    AnimatedContent(
        targetState = sheet,
        transitionSpec = {
            val slide = if (reduceMotion) {
                EnterTransition.None togetherWith ExitTransition.None
            } else {
                slideInVertically(ComposerSceneMotion.spec()) { it } togetherWith slideOutVertically(ComposerSceneMotion.spec()) { it }
            }
            slide using SizeTransform(clip = false)
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

/**
 * Les contrôles du geste en cours, posés sur la scène : la barre du haut (qui se tire pour fermer), la colonne, le panneau
 * et le socle ; [veiled] pendant un ajout (R5 de #13863) — estompés et retirés de TalkBack, le bouclier prend leurs touchers.
 */
@Composable
private fun SceneOverlays(
    pull: ComposerPullDismiss,
    slots: SceneOverlaySlots,
    onPanelTop: (Float) -> Unit,
    onTrailingLeft: (Float) -> Unit,
    veiled: Boolean = false,
) {
    Column(modifier = Modifier.fillMaxSize().veiledWhen(veiled).padding(OVERLAY_INSET)) {
        Box(
            modifier = Modifier.fillMaxWidth().draggable(
                orientation = Orientation.Vertical,
                state = rememberDraggableState { deltaPx -> pull.onDrag(deltaPx) },
                onDragStopped = { velocityPx -> pull.onRelease(velocityPx) },
            ),
        ) { slots.top() }
        slots.strip()
        Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
            Spacer(Modifier.weight(1f))
            Column(
                modifier = Modifier.fillMaxHeight().padding(top = MeeshySpacing.xs).onGloballyPositioned { onTrailingLeft(it.positionInRoot().x) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                content = slots.trailing,
            )
        }
        Box(modifier = Modifier.fillMaxWidth().onGloballyPositioned { onPanelTop(it.positionInRoot().y) }) { slots.panel() }
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xs),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            content = slots.socle,
        )
    }
}

/** Ce qu'un ajout en cours rend inerte (R5 de #13863) : estompé, et absent de TalkBack, qui n'y trouverait que des boutons sans effet. */
private fun Modifier.veiledWhen(busy: Boolean): Modifier =
    if (busy) graphicsLayer { alpha = VEILED_ALPHA }.clearAndSetSemantics {} else this

/** Prend tous les touchers de ce qu'il couvre : le voile d'un ajout en cours ne laisse rien passer en dessous de lui. */
@Composable
private fun BoxScope.TouchShield() {
    Box(
        Modifier.matchParentSize().pointerInput(Unit) {
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed = false).consume()
                do {
                    val event = awaitPointerEvent()
                    event.changes.forEach { it.consume() }
                } while (event.changes.any { it.pressed })
            }
        },
    )
}

private const val VEILED_ALPHA = 0.4f

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

/** Entre le rail et la scène qui lui cède son couloir : sans elle, une option semblerait posée sur la scène. */
private val LANE_GUTTER = 8.dp

/** Où se pose la scène : son échelle et son décalage, en `graphicsLayer` autour de son centre. */
private class SceneFrameTransform(val scale: Float, val offsetX: Float, val offsetY: Float)

/**
 * La scène qui cède au rail son couloir ([lane], en px, à droite) quand un objet sélectionné s'y édite (#14083, comme le
 * couloir d'iOS, `ComposerRailGeometry.lane`) : le 9:16 se réduit à la largeur qui reste et se range contre le bord
 * opposé, son haut là où le cadrage le posait ; un objet posé à droite n'est jamais sous les libellés du rail.
 */
private fun StoryCanvasFraming.Result.clearingTrailingLane(lane: Float, width: Float, height: Float): SceneFrameTransform {
    if (lane <= 0f || width <= 0f || lane >= width) return SceneFrameTransform(scale, 0f, offsetY)
    val cleared = minOf(scale, (width - lane) / width)
    val top = height / 2f * (1f - scale) + offsetY
    val offsetX = minOf(0f, (width - lane) - width / 2f * (1f + cleared))
    return SceneFrameTransform(cleared, offsetX, top - height / 2f * (1f - cleared))
}

private val RAIL_MARGIN = ComposerSceneArrangement.MARGIN.dp
private val BELOW_GAP = 8.dp
private val BELOW_RESERVE = ComposerSceneArrangement.PUBLISH_RESERVE.dp + RAIL_MARGIN
private val BELOW_MIN_WIDTH = 300.dp

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
