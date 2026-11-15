package me.meeshy.app.stories

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.runtime.Composable
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import me.meeshy.sdk.model.scene.StoryDrawingCanvasSpace
import me.meeshy.sdk.model.scene.StrokeCapture
import me.meeshy.sdk.model.scene.StrokeCaptureSample
import me.meeshy.ui.story.canvas.drawing.StrokeGeometryCache
import me.meeshy.ui.story.canvas.drawing.StrokeRibbonRenderer

/**
 * The story composer's freehand-drawing surface — renders the committed [strokes] (draw order) and, only while
 * [isCapturing], captures the drawing gesture like iOS `StrokeCaptureLayer`: the stylus pressure (or the finger speed)
 * drives the width ([StrokeCapture], `captureVersion` 1), coalesced historical points are kept so a fast flick loses
 * nothing, and the in-progress stroke is previewed by the very same ribbon renderer as the committed one.
 *
 * - Eraser: nothing is created nor previewed; the gesture points go to [onErase] on lift.
 * - A second finger cancels the stroke in progress and drives the viewport zoom through [onViewportPinch] instead.
 * - A cancelled gesture (the system or a parent took the touches) commits nothing; a lone tap commits one point (a disc).
 * When not capturing it is purely decorative: no pointer input, so it never steals touches from the canvas gestures.
 */
@Composable
fun StoryDrawingLayer(
    strokes: List<StoryDrawingStroke>,
    isCapturing: Boolean,
    activeColorHex: String,
    activeWidthDesign: Double,
    onStrokeCaptured: (List<StoryDrawingStrokePoint>) -> Unit,
    modifier: Modifier = Modifier,
    activeTool: StrokeTool = StrokeTool.PEN,
    activeSmoothing: StrokeSmoothing = StrokeSmoothing.CURVE,
    onErase: (List<StoryDrawingStrokePoint>) -> Unit = {},
    /** Cumulative zoom factor of the two-finger gesture and whether it has ended. */
    onViewportPinch: ((Float, Boolean) -> Unit)? = null,
) {
    var canvasWidthPx by remember { mutableFloatStateOf(0f) }
    var canvasHeightPx by remember { mutableFloatStateOf(0f) }
    var live by remember { mutableStateOf<StoryDrawingStroke?>(null) }
    val geometryCache = remember { StrokeGeometryCache() }
    val committedOps = remember(strokes) { StrokeRibbonRenderer.plan(strokes, cache = geometryCache) }
    val liveCache = remember { StrokeGeometryCache(capacity = 4) }
    val liveOps = remember(live) { live?.let { StrokeRibbonRenderer.plan(listOf(it), cache = liveCache) }.orEmpty() }
    val brush by rememberUpdatedState(DrawingBrush(activeTool, activeColorHex, activeWidthDesign, activeSmoothing))
    val onCaptured by rememberUpdatedState(onStrokeCaptured)
    val onErased by rememberUpdatedState(onErase)
    val onPinch by rememberUpdatedState(onViewportPinch)

    Canvas(
        modifier = modifier
            .onSizeChanged {
                canvasWidthPx = it.width.toFloat()
                canvasHeightPx = it.height.toFloat()
            }
            .then(
                if (isCapturing) {
                    Modifier.pointerInput(Unit) {
                        awaitEachGesture {
                            val session = DrawingSession()
                            try {
                                runDrawingGesture(
                                    session = session,
                                    size = { canvasWidthPx.toDouble() to canvasHeightPx.toDouble() },
                                    brush = { brush },
                                    onPreview = { live = it },
                                    onCommit = { points -> if (brush.tool == StrokeTool.ERASER) onErased(points) else onCaptured(points) },
                                    onPinch = { factor, ended -> onPinch?.invoke(factor, ended) },
                                )
                            } finally {
                                live = null
                            }
                        }
                    }
                } else {
                    Modifier
                },
            ),
    ) {
        drawIntoCanvas { canvas ->
            val native = canvas.nativeCanvas
            native.save()
            native.scale(size.width / StoryDrawingCanvasSpace.DESIGN_WIDTH, size.height / StoryDrawingCanvasSpace.DESIGN_HEIGHT)
            StrokeRibbonRenderer.draw(native, committedOps)
            StrokeRibbonRenderer.draw(native, liveOps)
            native.restore()
        }
    }
}

/** The brush a gesture draws with, read live so a colour change mid-session applies to the next stroke. */
internal data class DrawingBrush(val tool: StrokeTool, val colorHex: String, val widthDesign: Double, val smoothing: StrokeSmoothing)

/** Samples of the stroke in progress; a plain buffer so a long drag does not recompose per sample. */
internal class DrawingSession {
    val samples = ArrayList<StrokeCaptureSample>()
    var strokeId: String = "live"
    var stylus: Boolean = false
}

private const val MAX_FORCE = 1.0

/**
 * One drawing gesture, from the first down to the last up: a single pointer traces (stylus or finger), a second pointer
 * hands the gesture to the viewport pinch and abandons the stroke. Cancellation (the coroutine is cancelled when the
 * pointer stream is taken from us) leaves through the caller's `finally`, so nothing is committed.
 */
@OptIn(ExperimentalComposeUiApi::class)
private suspend fun androidx.compose.ui.input.pointer.AwaitPointerEventScope.runDrawingGesture(
    session: DrawingSession,
    size: () -> Pair<Double, Double>,
    brush: () -> DrawingBrush,
    onPreview: (StoryDrawingStroke?) -> Unit,
    onCommit: (List<StoryDrawingStrokePoint>) -> Unit,
    onPinch: (Float, Boolean) -> Unit,
) {
    val down = awaitFirstDown(requireUnconsumed = false)
    session.stylus = down.type == PointerType.Stylus || down.type == PointerType.Eraser
    val tracked = down.id
    session.strokeId = "live-${down.uptimeMillis}"
    session.samples.clear()
    session.samples += down.toSample(session.stylus)
    var pinching = false
    var zoom = 1f
    fun preview() {
        val (w, h) = size()
        val b = brush()
        if (b.tool == StrokeTool.ERASER) return onPreview(null)
        val points = StrokeCapture.points(session.samples, w, h, session.stylus)
        onPreview(
            if (points.isEmpty()) null else StoryDrawingStroke(
                id = session.strokeId,
                points = points,
                colorHex = b.colorHex,
                width = b.widthDesign,
                tool = b.tool,
                smoothing = b.smoothing,
                captureVersion = StrokeCapture.CAPTURE_VERSION,
            ),
        )
    }
    preview()
    while (true) {
        val event = awaitPointerEvent(PointerEventPass.Main)
        val pressed = event.changes.filter { it.pressed }
        if (pressed.size >= 2 && !pinching) {
            pinching = true
            session.samples.clear()
            onPreview(null)
        }
        if (pinching) {
            zoom *= event.calculateZoom()
            event.changes.forEach { it.consume() }
            onPinch(zoom, false)
            if (pressed.isEmpty()) return onPinch(zoom, true)
            continue
        }
        val change = event.changes.firstOrNull { it.id == tracked } ?: return
        val previousForce = session.samples.lastOrNull()?.force ?: MAX_FORCE
        val force = if (!session.stylus) MAX_FORCE else if (change.pressed) change.force() else previousForce
        change.historical.forEach { h ->
            session.samples += StrokeCaptureSample(h.position.x.toDouble(), h.position.y.toDouble(), h.uptimeMillis, force)
        }
        session.samples += StrokeCaptureSample(change.position.x.toDouble(), change.position.y.toDouble(), change.uptimeMillis, force)
        change.consume()
        if (!change.pressed) {
            val (w, h) = size()
            val points = StrokeCapture.points(session.samples, w, h, session.stylus)
            onPreview(null)
            if (points.isNotEmpty()) onCommit(points)
            return
        }
        preview()
    }
}

private fun PointerInputChange.force(): Double = pressure.toDouble().coerceIn(0.0, MAX_FORCE)

private fun PointerInputChange.toSample(stylus: Boolean): StrokeCaptureSample =
    StrokeCaptureSample(position.x.toDouble(), position.y.toDouble(), uptimeMillis, if (stylus) force() else MAX_FORCE)
