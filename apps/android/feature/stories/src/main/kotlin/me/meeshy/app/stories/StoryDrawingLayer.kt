package me.meeshy.app.stories

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.ui.theme.hexColor

/**
 * The story composer's freehand-drawing capture surface — renders the already
 * committed [strokes] (draw order, so later strokes paint over earlier ones) and,
 * only while [isCapturing], turns the whole surface into a finger-drag capture:
 * every drag builds one stroke's points in the canonical [StoryDrawingCanvasSpace]
 * and [onStrokeCaptured] fires with the finished list on release. When not
 * capturing the surface is purely decorative (no `pointerInput`), so it never
 * steals touches from the canvas' pan/zoom/element gestures underneath.
 *
 * Rendering is intentionally the minimal "raw" polyline (straight segments through
 * every captured point) regardless of a stroke's [me.meeshy.sdk.model.StrokeSmoothing] —
 * the model already carries `curve`/`line` for a future renderer, but interpolating
 * them is out of this lot's scope.
 */
@Composable
fun StoryDrawingLayer(
    strokes: List<StoryDrawingStroke>,
    isCapturing: Boolean,
    activeColorHex: String,
    activeWidthDesign: Double,
    onStrokeCaptured: (List<StoryDrawingStrokePoint>) -> Unit,
    modifier: Modifier = Modifier,
) {
    var canvasWidthPx by remember { mutableFloatStateOf(0f) }
    var canvasHeightPx by remember { mutableFloatStateOf(0f) }
    // The in-progress stroke is kept in plain (non-State) buffers and redrawn via a
    // bumped counter rather than a recomposing list — a long drag samples many points
    // per second, and re-diffing a growing List<Offset> on every one would be the
    // exact re-render churn the composer's fluidity rule forbids.
    var liveVersion by remember { mutableIntStateOf(0) }
    val livePath = remember { Path() }
    val liveDesignPoints = remember { mutableListOf<StoryDrawingStrokePoint>() }

    Canvas(
        modifier = modifier
            .onSizeChanged {
                canvasWidthPx = it.width.toFloat()
                canvasHeightPx = it.height.toFloat()
            }
            .then(
                if (isCapturing) {
                    Modifier.pointerInput(Unit) {
                        detectDragGestures(
                            onDragStart = { offset ->
                                livePath.reset()
                                liveDesignPoints.clear()
                                addLivePoint(offset, canvasWidthPx, canvasHeightPx, livePath, liveDesignPoints, isFirst = true)
                                liveVersion++
                            },
                            onDrag = { change, _ ->
                                change.consume()
                                addLivePoint(change.position, canvasWidthPx, canvasHeightPx, livePath, liveDesignPoints, isFirst = false)
                                liveVersion++
                            },
                            onDragEnd = {
                                onStrokeCaptured(liveDesignPoints.toList())
                                livePath.reset()
                                liveDesignPoints.clear()
                                liveVersion++
                            },
                            onDragCancel = {
                                livePath.reset()
                                liveDesignPoints.clear()
                                liveVersion++
                            },
                        )
                    }
                } else {
                    Modifier
                },
            ),
    ) {
        strokes.forEach { stroke ->
            if (stroke.points.size < 2) return@forEach
            val path = Path()
            stroke.points.forEachIndexed { index, point ->
                val x = StoryDrawingCanvasSpace.toScreenX(point.x, canvasWidthPx)
                val y = StoryDrawingCanvasSpace.toScreenY(point.y, canvasHeightPx)
                if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            drawPath(
                path = path,
                color = hexColor(stroke.colorHex),
                style = Stroke(
                    width = StoryDrawingCanvasSpace.toScreenWidth(stroke.width, canvasWidthPx),
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round,
                ),
            )
        }
        // Reading the version here subscribes this draw pass to every capture sample,
        // so the in-progress path redraws live without the point buffer itself being State.
        val redrawOn = liveVersion
        if (redrawOn >= 0 && liveDesignPoints.size >= 2) {
            drawPath(
                path = livePath,
                color = hexColor(activeColorHex),
                style = Stroke(
                    width = StoryDrawingCanvasSpace.toScreenWidth(activeWidthDesign, canvasWidthPx),
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round,
                ),
            )
        }
    }
}

private fun addLivePoint(
    offset: Offset,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    path: Path,
    designPoints: MutableList<StoryDrawingStrokePoint>,
    isFirst: Boolean,
) {
    if (isFirst) path.moveTo(offset.x, offset.y) else path.lineTo(offset.x, offset.y)
    StoryDrawingCanvasSpace.toDesignPoint(offset.x, offset.y, canvasWidthPx, canvasHeightPx)?.let(designPoints::add)
}

/**
 * The drawing tool's minimal controls, shown in place of the caption field while
 * drawing is active: a colour swatch row, three thickness steps, an undo button
 * (disabled with nothing to undo), and a "done" affordance that leaves the tool.
 * Mirrors the other composer pickers' small-curated-set pattern rather than a full
 * colour wheel or a continuous thickness slider.
 */
@Composable
fun StoryDrawingToolbar(
    activeColorHex: String,
    activeWidthDesign: Double,
    canUndo: Boolean,
    onColorSelected: (String) -> Unit,
    onWidthSelected: (Double) -> Unit,
    onUndo: () -> Unit,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        IconButton(onClick = onUndo, enabled = canUndo) {
            Icon(Icons.Filled.Undo, contentDescription = stringResource(R.string.stories_composer_draw_undo))
        }
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            StoryDrawingPalette.colors.forEach { colorHex ->
                DrawSwatch(
                    colorHex = colorHex,
                    selected = colorHex.equals(activeColorHex, ignoreCase = true),
                    onClick = { onColorSelected(colorHex) },
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            StoryDrawingPalette.widths.forEach { width ->
                DrawWidthDot(
                    widthDesign = width,
                    selected = width == activeWidthDesign,
                    onClick = { onWidthSelected(width) },
                )
            }
        }
        IconButton(onClick = onDone) {
            Icon(Icons.Filled.Check, contentDescription = stringResource(R.string.stories_composer_draw_done))
        }
    }
}

@Composable
private fun DrawSwatch(colorHex: String, selected: Boolean, onClick: () -> Unit) {
    val ringColor = if (selected) MaterialTheme.colorScheme.primary else Color.Transparent
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(CircleShape)
            .border(2.dp, ringColor, CircleShape)
            .padding(3.dp)
            .clip(CircleShape)
            .background(hexColor(colorHex))
            .clickable(onClick = onClick)
            .semantics { contentDescription = colorHex },
    ) {}
}

@Composable
private fun DrawWidthDot(widthDesign: Double, selected: Boolean, onClick: () -> Unit) {
    val fraction = (widthDesign / StoryDrawingPalette.widths.last()).coerceIn(0.35, 1.0)
    val dotSize = (10 + fraction * 10).dp
    val color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Box(
        modifier = Modifier
            .size(28.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(dotSize)
                .clip(CircleShape)
                .background(color),
        ) {}
    }
}
