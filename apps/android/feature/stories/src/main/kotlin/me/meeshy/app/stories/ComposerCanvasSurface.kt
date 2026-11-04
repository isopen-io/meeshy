package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerFormatLabel
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectMenu
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import me.meeshy.ui.story.canvas.sceneRootPoseLayer
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.composer.scene.StoryFitMode
import me.meeshy.sdk.model.scene.InlineEditLayout
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.sdk.model.scene.SceneManipulationLayer
import me.meeshy.sdk.model.scene.SceneManipulationLayerRule
import me.meeshy.ui.component.imageedit.sceneLook
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.story.canvas.edit.SceneGuidesOverlay
import me.meeshy.ui.story.canvas.edit.SceneInlineEditScrim
import me.meeshy.ui.story.canvas.edit.sceneBackgroundGestures
import me.meeshy.ui.story.canvas.edit.sceneManipulationGestures
import me.meeshy.ui.story.canvas.edit.sceneThreeFingerPinch
import me.meeshy.sdk.model.scene.CanvasViewportZoomPolicy

/**
 * The 9:16 story canvas for the **selected** slide. Renders that slide's first
 * media as the background, then the scene's objects in the ONE order of its [stack] (#13852: texts, placed media,
 * stickers, and the [pins] — places and voice chips — interleaved by rank; composition order is paint AND touch order),
 * the drawing on top, and lets the
 * user pinch-zoom + drag-pan the background and drag / tap / remove each element. All
 * transform and clamp math lives in the pure, unit-tested [StoryCanvasTransform] /
 * [StoryTextElement]: each gesture callback is forwarded verbatim (pixels divided by
 * the measured canvas size into normalised fractions), so this Composable stays
 * declarative glue. A tap on an object selects it — no frame, [sceneSelection] (#14207) —, a tap on the
 * empty canvas deselects ([onBackgroundTap], #13836).
 *
 * Only the scene's own objects are painted IN it. The editor's chrome (cross, tools, publish) is laid OVER it by
 * [StorySceneFirstLayout] (#13834, which replaces the « nothing on the canvas » geography of #4561/#4633 for the story):
 * that chrome is a sibling, never a child, so the published render never shows it. The export does not read this
 * surface: it renders every slide from the publish projection, by the stories engine (#13897).
 */
@Composable
internal fun StoryCanvasSurface(
    transform: StoryCanvasTransform,
    backgroundModel: Any?,
    sceneBrush: Brush,
    look: SceneLookRecipe,
    textElements: List<StoryTextElement>,
    selectedElement: StoryTextElement?,
    sceneMenu: SceneObjectContextMenu?,
    inlineEditEnabled: Boolean,
    stickers: List<StoryStickerElement>,
    selectedStickerId: String?,
    strokes: List<StoryDrawingStroke>,
    isDrawingActive: Boolean,
    drawColorHex: String,
    drawWidthDesign: Double,
    drawTool: me.meeshy.sdk.model.StrokeTool = me.meeshy.sdk.model.StrokeTool.PEN,
    drawSmoothing: me.meeshy.sdk.model.StrokeSmoothing = me.meeshy.sdk.model.StrokeSmoothing.CURVE,
    onStrokeErased: (List<StoryDrawingStrokePoint>) -> Unit = {},
    onStrokeCaptured: (List<StoryDrawingStrokePoint>) -> Unit,
    onTransform: (Float, Float, Float, Float, Float) -> Unit,
    onElementTap: (String) -> Unit,
    onElementLongPress: (String) -> Unit,
    onSceneMenuAction: (SceneObjectMenu.Action) -> Unit,
    onSceneMenuDismiss: () -> Unit,
    onElementDrag: (String, Float, Float) -> Unit,
    onElementDragEnd: () -> Unit,
    onElementTransform: (String, Float, Float) -> Unit,
    onElementTextChange: (String) -> Unit,
    onInlineEditYield: () -> Unit = {},
    onStickerTap: (String) -> Unit,
    onStickerLongPress: (String) -> Unit,
    onStickerDrag: (String, Float, Float) -> Unit,
    onStickerDragEnd: () -> Unit,
    onStickerTransform: (String, Float, Float) -> Unit,
    placedMedia: List<PlacedMediaFrame>,
    placedMediaGestures: PlacedMediaGestures,
    onBackgroundTap: () -> Unit,
    snapFeedback: SnapFeedback?,
    modifier: Modifier = Modifier,
    fitMode: String = StoryFitMode.FILL,
    backdrop: StoryBackdrop = StoryBackdrop.BLUR,
    onBackgroundLongPress: (() -> Unit)? = null,
    backgroundRotationDeg: Float = 0f,
    backgroundCrop: StoryMediaCrop? = null,
    backgroundSourceAspect: Double? = null,
    selectedMediaId: String? = null,
    stack: List<SceneObjectRef>,
    pins: @Composable (ref: SceneObjectRef, canvasWidthPx: Float, canvasHeightPx: Float) -> Unit = { _, _, _ -> },
    live: ComposerLiveStage? = null,
    canvasFormat: me.meeshy.sdk.model.scene.CanvasFormat = me.meeshy.sdk.model.scene.CanvasFormat.PORTRAIT,
    manipulationOverride: SceneManipulationLayer? = null,
    onBackgroundRotate: ((Float) -> Unit)? = null,
    onBackgroundDoubleTap: (() -> Unit)? = null,
    viewportScale: Float = 1f,
    onViewportScale: ((Float) -> Unit)? = null,
    rootPose: () -> me.meeshy.sdk.model.scene.SceneRootPose = { me.meeshy.sdk.model.scene.SceneRootPose.NEUTRAL },
) {
    val canvasLabel = formatLabel(ComposerFormatLabel.CANVAS)
    val backgroundTap by rememberUpdatedState(onBackgroundTap)
    val backgroundLongPress by rememberUpdatedState(onBackgroundLongPress)
    val backgroundDoubleTap by rememberUpdatedState(onBackgroundDoubleTap)
    val frameShape = RoundedCornerShape(16.dp)
    val warnBorder = if (snapFeedback?.withinSafeZone == false) {
        BorderStroke(2.dp, MaterialTheme.colorScheme.error)
    } else {
        null
    }
    var canvasWidthPx by remember { mutableFloatStateOf(0f) }
    var canvasHeightPx by remember { mutableFloatStateOf(0f) }
    // Cascade of the manipulable layer (iOS CanvasManipulationLayer): blank = nothing moves, background alone = the
    // background moves, any foreground object = only the foreground does. Drawing mode suspends manipulation.
    val manipulationLayer = SceneManipulationLayerRule.resolve(
        hasForeground = stack.any { it.kind != ComposerObjectKind.AUDIO },
        hasBackground = backgroundModel != null,
        override = manipulationOverride,
    )
    var backgroundGesturing by remember { mutableStateOf(false) }
    var objectGesturing by remember { mutableStateOf(false) }
    val haptics = rememberMeeshyHaptics()
    // Le pincement à trois doigts : [pinchScale] est le facteur du geste en cours, [viewportScale] l'échelle posée.
    var pinchScale by remember { mutableFloatStateOf(1f) }
    val settledViewport by rememberUpdatedState(viewportScale)
    val shownViewport = (viewportScale * pinchScale).coerceIn(CanvasViewportZoomPolicy.MIN_SCALE, CanvasViewportZoomPolicy.MAX_SCALE)
    val engagedVertical = snapFeedback?.verticalGuide
    val engagedHorizontal = snapFeedback?.horizontalGuide
    LaunchedEffect(engagedVertical, engagedHorizontal) {
        if (engagedVertical != null || engagedHorizontal != null) haptics.light()
    }
    Box(
        modifier = modifier.sceneThreeFingerPinch(
            enabled = onViewportScale != null && !isDrawingActive,
            onScale = { pinchScale = it },
            onEnd = { final ->
                pinchScale = 1f
                if (final != null) onViewportScale?.invoke(CanvasViewportZoomPolicy.settledScale(settledViewport, final))
            },
        ),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .graphicsLayer {
                    scaleX = shownViewport
                    scaleY = shownViewport
                }
                .sceneRootPoseLayer(rootPose)
                .then(if (canvasFormat == me.meeshy.sdk.model.scene.CanvasFormat.PORTRAIT) Modifier.fillMaxHeight() else Modifier.fillMaxWidth())
                .aspectRatio(canvasFormat.ratio.toFloat())
                .clip(frameShape)
                .background(sceneBrush)
                .then(
                    if (warnBorder != null) {
                        Modifier.border(warnBorder, RoundedCornerShape(16.dp))
                    } else {
                        Modifier
                    },
                )
                .onSizeChanged {
                    canvasWidthPx = it.width.toFloat()
                    canvasHeightPx = it.height.toFloat()
                }
                .semantics { contentDescription = canvasLabel }
                .then(
                    // While the drawing tool is capturing, the canvas' own tap-to-deselect and
                    // pinch/pan gestures step aside entirely — StoryDrawingLayer below owns every
                    // touch, so a stroke never fights the background transform for the same drag.
                    if (isDrawingActive) {
                        Modifier
                    } else {
                        Modifier
                            .sceneBackgroundGestures(
                                onTap = { backgroundTap() },
                                onDoubleTap = onBackgroundDoubleTap?.let { { backgroundDoubleTap?.invoke() } },
                                onLongPress = onBackgroundLongPress?.let { { backgroundLongPress?.invoke() } },
                            )
                            .sceneManipulationGestures(
                                enabled = manipulationLayer == SceneManipulationLayer.BACKGROUND,
                                onBegin = { backgroundGesturing = true },
                                onChange = { pan, zoom, rotationDeg ->
                                    onTransform(pan.x, pan.y, zoom, canvasWidthPx, canvasHeightPx)
                                    if (rotationDeg != 0f) onBackgroundRotate?.invoke(rotationDeg)
                                },
                                onEnd = { backgroundGesturing = false },
                            )
                    },
                ),
        ) {
            val filled = StoryFitMode.rendersFilled(fitMode)
            val layer = transform.backgroundLayer(backgroundCrop, backgroundSourceAspect, filled, canvasWidthPx, canvasHeightPx)
            if (backgroundModel != null) {
                if (!filled) SceneBackdropLayer(backdrop, backgroundModel)
                AsyncImage(
                    model = backgroundModel,
                    contentDescription = null,
                    contentScale = if (filled) ContentScale.Crop else ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            scaleX = layer.scaleX
                            scaleY = layer.scaleY
                            translationX = layer.translationX
                            translationY = layer.translationY
                            rotationZ = backgroundRotationDeg
                        }
                        .sceneLook(look),
                )
            }
            // La vidéo de fond joue en continu sur la scène (#13863), même avant que son affiche soit décodée.
            live?.background?.let { slot -> LiveBackground(slot, layer, backgroundRotationDeg, look, fit = !filled) }
            // Limits + magnetic lines exist only while a gesture runs; nothing is painted at rest (no permanent grid).
            SceneGuidesOverlay(
                active = snapFeedback != null || backgroundGesturing || objectGesturing,
                verticalLines = StorySafeZoneGrid.MAGNETIC_LINES,
                horizontalLines = StorySafeZoneGrid.MAGNETIC_LINES,
                engagedVertical = engagedVertical,
                engagedHorizontal = engagedHorizontal,
                cornerRadius = 16.dp,
            )
            val textById = textElements.associateBy { it.id }
            val stickerById = stickers.associateBy { it.id }
            val mediaById = placedMedia.associateBy { it.key }
            val recenteredTextId = selectedElement?.id?.takeIf { id ->
                inlineEditEnabled && !isDrawingActive && textById.containsKey(id) &&
                    sceneMenu?.ref != SceneObjectRef(ComposerObjectKind.TEXT, id)
            }
            val density = LocalDensity.current
            val editZone = remember(canvasHeightPx, density) {
                InlineEditLayout.zone(
                    topChromeBottom = null, toolsTop = null, imeTop = null,
                    canvasHeight = canvasHeightPx,
                    gap = InlineEditLayout.FLOOR_GAP_DP * density.density,
                    minHeight = InlineEditLayout.MIN_ZONE_HEIGHT_DP * density.density,
                )
            }
            val renderText: @Composable (StoryTextElement) -> Unit = { element ->
                val ref = SceneObjectRef(ComposerObjectKind.TEXT, element.id)
                TextElementLayer(
                    element = element,
                    selected = element.id == selectedElement?.id,
                    menu = sceneMenu?.takeIf { it.ref == ref },
                    recentered = element.id == recenteredTextId,
                    editZone = editZone,
                    onInlineEditYield = onInlineEditYield,
                    inlineEditEnabled = inlineEditEnabled,
                    canvasWidthPx = canvasWidthPx,
                    canvasHeightPx = canvasHeightPx,
                    onTap = { onElementTap(element.id) },
                    onLongPress = { onElementLongPress(element.id) },
                    onMenuAction = onSceneMenuAction,
                    onMenuDismiss = onSceneMenuDismiss,
                    onDrag = { dxPx, dyPx ->
                        if (canvasWidthPx > 0f && canvasHeightPx > 0f) {
                            objectGesturing = true
                            onElementDrag(element.id, dxPx / canvasWidthPx, dyPx / canvasHeightPx)
                        }
                    },
                    onDragEnd = { objectGesturing = false; onElementDragEnd() },
                    onTransform = { zoom, rotationDeg -> objectGesturing = true; onElementTransform(element.id, zoom, rotationDeg) },
                    onTextChange = onElementTextChange,
                )
            
            }
            val preview = LocalComposerTimelinePreview.current
            stack.forEach { ref ->
                key(ref.kind, ref.id) {
                    Box(Modifier.fillMaxSize().graphicsLayer { alpha = preview?.opacity(ref.id) ?: 1f }) {
                    when (ref.kind) {
                        ComposerObjectKind.TEXT -> textById[ref.id]?.let { element ->
                            if (element.id != recenteredTextId) renderText(element)
                        }
                        ComposerObjectKind.MEDIA -> mediaById[ref.id]?.let { frame ->
                            PlacedMediaLayer(
                                frame, canvasWidthPx, canvasHeightPx, placedMediaGestures,
                                selected = frame.key == selectedMediaId,
                                live = live?.placed(frame.key),
                            )
                        }
                        ComposerObjectKind.STICKER -> stickerById[ref.id]?.let { sticker ->
                            StickerLayer(
                                sticker = sticker,
                                selected = sticker.id == selectedStickerId,
                                menu = sceneMenu?.takeIf { it.ref == ref },
                                canvasWidthPx = canvasWidthPx,
                                canvasHeightPx = canvasHeightPx,
                                onTap = { onStickerTap(sticker.id) },
                                onLongPress = { onStickerLongPress(sticker.id) },
                                onMenuAction = onSceneMenuAction,
                                onMenuDismiss = onSceneMenuDismiss,
                                onDrag = { dxPx, dyPx ->
                                    if (canvasWidthPx > 0f && canvasHeightPx > 0f) {
                                        objectGesturing = true
                                        onStickerDrag(sticker.id, dxPx / canvasWidthPx, dyPx / canvasHeightPx)
                                    }
                                },
                                onDragEnd = { objectGesturing = false; onStickerDragEnd() },
                                onTransform = { zoom, rotationDeg -> objectGesturing = true; onStickerTransform(sticker.id, zoom, rotationDeg) },
                            )
                        }
                        ComposerObjectKind.PLACE, ComposerObjectKind.AUDIO -> pins(ref, canvasWidthPx, canvasHeightPx)
                    }
                    }
                }
            }
            // Saisie en place : le reste de la scène passe sous un voile, le texte écrit reste au-dessus, dans la bande libre.
            SceneInlineEditScrim(visible = recenteredTextId != null)
            recenteredTextId?.let { id -> textById[id]?.let { element -> key("inline-edit", id) { renderText(element) } } }
            // Topmost: paints every committed stroke, and — only while isDrawingActive —
            // also captures the drag that draws the next one, blocking the pan/zoom/tap
            // gestures underneath so a stroke never fights the background transform.
            StoryDrawingLayer(
                strokes = strokes,
                isCapturing = isDrawingActive,
                activeColorHex = drawColorHex,
                activeWidthDesign = drawWidthDesign,
                activeTool = drawTool,
                activeSmoothing = drawSmoothing,
                onStrokeCaptured = onStrokeCaptured,
                onErase = onStrokeErased,
                onViewportPinch = onViewportScale?.let { settle ->
                    { factor: Float, ended: Boolean ->
                        if (ended) {
                            pinchScale = 1f
                            settle(CanvasViewportZoomPolicy.settledScale(settledViewport, factor))
                        } else {
                            pinchScale = factor
                        }
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/** La vidéo de fond sélectionnée joue à la place de son affiche, à la même pose, sous le même look (#13973, A-E3). */
@Composable
private fun LiveBackground(slot: ComposerLiveSlot, layer: BackgroundLayer, rotationDeg: Float, look: SceneLookRecipe, fit: Boolean) {
    Box(
        Modifier
            .fillMaxSize()
            .graphicsLayer {
                scaleX = layer.scaleX
                scaleY = layer.scaleY
                translationX = layer.translationX
                translationY = layer.translationY
                rotationZ = rotationDeg
            }
            .sceneLook(look),
    ) { slot.Picture(fit = fit) }
}

