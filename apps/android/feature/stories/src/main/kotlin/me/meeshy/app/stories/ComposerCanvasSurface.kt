package me.meeshy.app.stories

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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import coil.compose.AsyncImage
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import me.meeshy.sdk.model.scene.StoryColorMatrix

/**
 * The 9:16 story canvas for the **selected** slide. Renders that slide's first
 * media as the background, the slide's on-canvas [textElements] on top, and lets the
 * user pinch-zoom + drag-pan the background and drag / tap / remove each element. All
 * transform and clamp math lives in the pure, unit-tested [StoryCanvasTransform] /
 * [StoryTextElement]: each gesture callback is forwarded verbatim (pixels divided by
 * the measured canvas size into normalised fractions), so this Composable stays
 * declarative glue. A tap on the empty canvas deselects ([onBackgroundTap]).
 *
 * While a text element is being edited the [floatingToolbar] floats in-place just
 * clear of that element — above or below it, clamped inside the canvas — at the
 * vertical anchor decided by the pure, unit-tested [StoryToolbarPlacement] (fed the
 * element's measured centre/half-height, the toolbar's measured height, and the
 * keyboard-shrunk canvas height). The composer applies `imePadding`, so the canvas
 * already excludes the soft keyboard and the toolbar always lands in view.
 */
@Composable
internal fun StoryCanvasSurface(
    transform: StoryCanvasTransform,
    backgroundModel: Any?,
    colorMatrix: StoryColorMatrix,
    textElements: List<StoryTextElement>,
    selectedElement: StoryTextElement?,
    elementMenu: StoryElementContextMenu?,
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
    onElementMenuAction: (StoryElementAction) -> Unit,
    onElementMenuDismiss: () -> Unit,
    onElementDrag: (String, Float, Float) -> Unit,
    onElementDragEnd: () -> Unit,
    onElementTransform: (String, Float, Float) -> Unit,
    onElementRemove: (String) -> Unit,
    onStickerTap: (String) -> Unit,
    onStickerDrag: (String, Float, Float) -> Unit,
    onStickerTransform: (String, Float, Float) -> Unit,
    onStickerRemove: (String) -> Unit,
    onBackgroundTap: () -> Unit,
    snapFeedback: SnapFeedback?,
    modifier: Modifier = Modifier,
    floatingToolbar: @Composable () -> Unit = {},
) {
    val canvasLabel = stringResource(R.string.stories_composer_canvas)
    val guideColor = MaterialTheme.colorScheme.primary
    val warnBorder = if (snapFeedback?.withinSafeZone == false) {
        BorderStroke(2.dp, MaterialTheme.colorScheme.error)
    } else {
        null
    }
    var canvasWidthPx by remember { mutableFloatStateOf(0f) }
    var canvasHeightPx by remember { mutableFloatStateOf(0f) }
    var selectedHalfHeightPx by remember { mutableFloatStateOf(0f) }
    var toolbarHeightPx by remember { mutableFloatStateOf(0f) }
    val gapPx = with(LocalDensity.current) { 8.dp.toPx() }
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .aspectRatio(9f / 16f)
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
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
                            .pointerInput(Unit) { detectTapGestures { onBackgroundTap() } }
                            .pointerInput(Unit) {
                                detectTransformGestures { _, pan, zoom, _ ->
                                    onTransform(pan.x, pan.y, zoom, canvasWidthPx, canvasHeightPx)
                                }
                            }
                    },
                ),
        ) {
            if (backgroundModel != null) {
                AsyncImage(
                    model = backgroundModel,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    colorFilter = ColorFilter.colorMatrix(ColorMatrix(colorMatrix.values.toFloatArray())),
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            scaleX = transform.scale
                            scaleY = transform.scale
                            translationX = transform.offsetX
                            translationY = transform.offsetY
                        },
                )
            }
            if (snapFeedback != null) {
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
            textElements.forEach { element ->
                TextElementLayer(
                    element = element,
                    selected = element.id == selectedElement?.id,
                    menu = elementMenu?.takeIf { it.elementId == element.id },
                    canvasWidthPx = canvasWidthPx,
                    canvasHeightPx = canvasHeightPx,
                    onTap = { onElementTap(element.id) },
                    onLongPress = { onElementLongPress(element.id) },
                    onMenuAction = onElementMenuAction,
                    onMenuDismiss = onElementMenuDismiss,
                    onDrag = { dxPx, dyPx ->
                        if (canvasWidthPx > 0f && canvasHeightPx > 0f) {
                            onElementDrag(element.id, dxPx / canvasWidthPx, dyPx / canvasHeightPx)
                        }
                    },
                    onDragEnd = onElementDragEnd,
                    onTransform = { zoom, rotationDeg -> onElementTransform(element.id, zoom, rotationDeg) },
                    onRemove = { onElementRemove(element.id) },
                    onMeasured = { size ->
                        if (element.id == selectedElement?.id) selectedHalfHeightPx = size.height / 2f
                    },
                )
            }
            stickers.forEach { sticker ->
                StickerLayer(
                    sticker = sticker,
                    selected = sticker.id == selectedStickerId,
                    canvasWidthPx = canvasWidthPx,
                    canvasHeightPx = canvasHeightPx,
                    onTap = { onStickerTap(sticker.id) },
                    onDrag = { dxPx, dyPx ->
                        if (canvasWidthPx > 0f && canvasHeightPx > 0f) {
                            onStickerDrag(sticker.id, dxPx / canvasWidthPx, dyPx / canvasHeightPx)
                        }
                    },
                    onTransform = { zoom, rotationDeg -> onStickerTransform(sticker.id, zoom, rotationDeg) },
                    onRemove = { onStickerRemove(sticker.id) },
                )
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
            if (selectedElement != null) {
                val placement = StoryToolbarPlacement.resolve(
                    elementCenterYpx = selectedElement.y * canvasHeightPx,
                    elementHalfHeightPx = selectedHalfHeightPx,
                    toolbarHeightPx = toolbarHeightPx,
                    canvasHeightPx = canvasHeightPx,
                    gapPx = gapPx,
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .offset { IntOffset(0, placement.topPx.roundToInt()) }
                        .padding(horizontal = 8.dp)
                        .onSizeChanged { toolbarHeightPx = it.height.toFloat() }
                        .background(
                            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                            shape = RoundedCornerShape(12.dp),
                        )
                        .padding(8.dp),
                ) {
                    floatingToolbar()
                }
            }
        }
    }
}
