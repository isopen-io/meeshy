package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectMenu
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.composer.scene.StoryFitMode
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.ui.component.imageedit.sceneLook
import me.meeshy.ui.theme.hexColor

/**
 * The 9:16 story canvas for the **selected** slide. Renders that slide's first
 * media as the background, then the scene's objects in the ONE order of its [stack] (#13852: texts, placed media,
 * stickers, and the [pins] — places and voice chips — interleaved by rank; composition order is paint AND touch order),
 * the drawing on top, and lets the
 * user pinch-zoom + drag-pan the background and drag / tap / remove each element. All
 * transform and clamp math lives in the pure, unit-tested [StoryCanvasTransform] /
 * [StoryTextElement]: each gesture callback is forwarded verbatim (pixels divided by
 * the measured canvas size into normalised fractions), so this Composable stays
 * declarative glue. A tap on an object selects it — framed by [sceneSelectionFrame], never in a capture —, a tap on the
 * empty canvas deselects ([onBackgroundTap], #13836).
 *
 * Only the scene's own objects are painted IN it. The editor's chrome (cross, tools, publish) is laid OVER it by
 * [StorySceneFirstLayout] (#13834, which replaces the « nothing on the canvas » geography of #4561/#4633 for the story):
 * that chrome is a sibling, never a child, so [capture] records the scene alone and the published render never shows it.
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
    capture: SceneCapture? = null,
    onBackgroundLongPress: (() -> Unit)? = null,
    selectedMediaId: String? = null,
    stack: List<SceneObjectRef>,
    pins: @Composable (ref: SceneObjectRef, canvasWidthPx: Float, canvasHeightPx: Float, capturing: Boolean) -> Unit = { _, _, _, _ -> },
) {
    val canvasLabel = stringResource(R.string.stories_composer_canvas)
    val backgroundTap by rememberUpdatedState(onBackgroundTap)
    val backgroundLongPress by rememberUpdatedState(onBackgroundLongPress)
    val capturing = capture != null && capture.pass != SceneCapturePass.NONE
    val overlayOnly = capture?.pass == SceneCapturePass.OVERLAY_ONLY
    val frameShape = if (capturing) RectangleShape else RoundedCornerShape(16.dp)
    val guideColor = MaterialTheme.colorScheme.primary
    val warnBorder = if (!capturing && snapFeedback?.withinSafeZone == false) {
        BorderStroke(2.dp, MaterialTheme.colorScheme.error)
    } else {
        null
    }
    var canvasWidthPx by remember { mutableFloatStateOf(0f) }
    var canvasHeightPx by remember { mutableFloatStateOf(0f) }
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .aspectRatio(9f / 16f)
                .then(if (capturing) Modifier.recordInto(capture!!.layer) else Modifier)
                .clip(frameShape)
                .then(if (overlayOnly) Modifier else Modifier.background(sceneBrush))
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
                            .pointerInput(onBackgroundLongPress != null) {
                                detectTapGestures(
                                    onLongPress = if (onBackgroundLongPress != null) ({ _ -> backgroundLongPress?.invoke() }) else null,
                                    onTap = { backgroundTap() },
                                )
                            }
                            .pointerInput(Unit) {
                                detectTransformGestures { _, pan, zoom, _ ->
                                    onTransform(pan.x, pan.y, zoom, canvasWidthPx, canvasHeightPx)
                                }
                            }
                    },
                ),
        ) {
            if (backgroundModel != null && !overlayOnly) {
                val filled = StoryFitMode.rendersFilled(fitMode)
                if (!filled) SceneBackdropLayer(backdrop, backgroundModel)
                AsyncImage(
                    model = backgroundModel,
                    contentDescription = null,
                    contentScale = if (filled) ContentScale.Crop else ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            scaleX = transform.scale
                            scaleY = transform.scale
                            translationX = transform.offsetX
                            translationY = transform.offsetY
                        }
                        .sceneLook(look),
                )
            }
            if (snapFeedback != null && !capturing) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    // Persistent composition overlay (parity with iOS SafeZoneOverlay): while an
                    // element is being dragged, draw the viewer-chrome safe rectangle and the
                    // rule-of-thirds grid so the author frames content clear of the viewer's
                    // top/bottom chrome. Geometry from the pure, unit-tested StorySafeZoneGrid.
                    val grid = StorySafeZoneGrid.geometry(size.width, size.height)
                    if (!grid.isEmpty) {
                        val gridColor = guideColor.copy(alpha = 0.35f)
                        val dash = PathEffect.dashPathEffect(floatArrayOf(12f, 12f))
                        grid.verticalThirds.forEach { gx ->
                            drawLine(
                                color = gridColor,
                                start = Offset(gx, 0f),
                                end = Offset(gx, size.height),
                                strokeWidth = 1f,
                                pathEffect = dash,
                            )
                        }
                        grid.horizontalThirds.forEach { gy ->
                            drawLine(
                                color = gridColor,
                                start = Offset(0f, gy),
                                end = Offset(size.width, gy),
                                strokeWidth = 1f,
                                pathEffect = dash,
                            )
                        }
                        drawRect(
                            color = gridColor,
                            topLeft = Offset(grid.safeLeft, grid.safeTop),
                            size = Size(grid.safeRight - grid.safeLeft, grid.safeBottom - grid.safeTop),
                            style = Stroke(width = 1.5f, pathEffect = dash),
                        )
                    }
                    snapFeedback.verticalGuide?.let { gx ->
                        drawLine(
                            color = guideColor,
                            start = Offset(gx * size.width, 0f),
                            end = Offset(gx * size.width, size.height),
                            strokeWidth = 2f,
                        )
                    }
                    snapFeedback.horizontalGuide?.let { gy ->
                        drawLine(
                            color = guideColor,
                            start = Offset(0f, gy * size.height),
                            end = Offset(size.width, gy * size.height),
                            strokeWidth = 2f,
                        )
                    }
                }
            }
            val textById = textElements.associateBy { it.id }
            val stickerById = stickers.associateBy { it.id }
            val mediaById = placedMedia.associateBy { it.key }
            stack.forEach { ref ->
                key(ref.kind, ref.id) {
                    when (ref.kind) {
                        ComposerObjectKind.TEXT -> textById[ref.id]?.let { element ->
                            TextElementLayer(
                                element = element,
                                selected = element.id == selectedElement?.id,
                                menu = sceneMenu?.takeIf { it.ref == ref },
                                inlineEditEnabled = inlineEditEnabled,
                                canvasWidthPx = canvasWidthPx,
                                canvasHeightPx = canvasHeightPx,
                                onTap = { onElementTap(element.id) },
                                onLongPress = { onElementLongPress(element.id) },
                                onMenuAction = onSceneMenuAction,
                                onMenuDismiss = onSceneMenuDismiss,
                                onDrag = { dxPx, dyPx ->
                                    if (canvasWidthPx > 0f && canvasHeightPx > 0f) {
                                        onElementDrag(element.id, dxPx / canvasWidthPx, dyPx / canvasHeightPx)
                                    }
                                },
                                onDragEnd = onElementDragEnd,
                                onTransform = { zoom, rotationDeg -> onElementTransform(element.id, zoom, rotationDeg) },
                                onTextChange = onElementTextChange,
                                showsSelection = !capturing,
                            )
                        }
                        ComposerObjectKind.MEDIA -> mediaById[ref.id]?.let { frame ->
                            PlacedMediaLayer(frame, canvasWidthPx, canvasHeightPx, placedMediaGestures, selected = !capturing && frame.key == selectedMediaId, marksPending = !capturing)
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
                                        onStickerDrag(sticker.id, dxPx / canvasWidthPx, dyPx / canvasHeightPx)
                                    }
                                },
                                onDragEnd = onStickerDragEnd,
                                onTransform = { zoom, rotationDeg -> onStickerTransform(sticker.id, zoom, rotationDeg) },
                                showsSelection = !capturing,
                            )
                        }
                        ComposerObjectKind.PLACE, ComposerObjectKind.AUDIO -> pins(ref, canvasWidthPx, canvasHeightPx, capturing)
                    }
                }
            }
            // Topmost: paints every committed stroke, and — only while isDrawingActive —
            // also captures the drag that draws the next one, blocking the pan/zoom/tap
            // gestures underneath so a stroke never fights the background transform.
            StoryDrawingLayer(
                strokes = strokes,
                isCapturing = isDrawingActive,
                activeColorHex = drawColorHex,
                activeWidthDesign = drawWidthDesign,
                onStrokeCaptured = onStrokeCaptured,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/** Où en est la capture de la scène pour son export : rien, la scène entière, ou ses objets seuls (fond vidéo). */
internal enum class SceneCapturePass { NONE, FULL, OVERLAY_ONLY }

internal class SceneCapture(val layer: GraphicsLayer, val pass: SceneCapturePass)

/** Enregistre ce que la scène PEINT dans [layer], puis le rejoue : la capture est exactement ce que l'auteur voit. */
private fun Modifier.recordInto(layer: GraphicsLayer): Modifier = drawWithContent {
    layer.record { this@drawWithContent.drawContent() }
    drawLayer(layer)
}

/**
 * Le fond des bandes d'un média AJUSTÉ : une teinte unie, ou le flou du média lui-même. Le flou n'existe qu'à partir de
 * l'API 31 ; en dessous le noir tient la place — jamais un flou factice.
 */
@Composable
private fun SceneBackdropLayer(backdrop: StoryBackdrop, model: Any) {
    val hex = backdrop.solidHex
    when {
        hex != null -> Box(Modifier.fillMaxSize().background(hexColor(hex)))
        android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S -> AsyncImage(
            model = model,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().blur(BACKDROP_BLUR_DP.dp),
        )
        else -> Box(Modifier.fillMaxSize().background(hexColor(StoryBackdrop.BLACK.solidHex.orEmpty())))
    }
}

private const val BACKDROP_BLUR_DP = 24
