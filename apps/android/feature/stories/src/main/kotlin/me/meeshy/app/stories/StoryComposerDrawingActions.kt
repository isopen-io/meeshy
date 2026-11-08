package me.meeshy.app.stories

import java.time.Instant
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import me.meeshy.sdk.model.scene.StrokePoint

/** Enters the drawing tool (closes the band, clears selections). */
fun StoryComposerViewModel.onEnterDrawingMode() = onSceneReduce { StoryComposerDrawingReducer.entered(it) }

fun StoryComposerViewModel.onExitDrawingMode() = onSceneReduce { StoryComposerDrawingReducer.exited(it) }

fun StoryComposerViewModel.onDrawColorSelected(colorHex: String) = onSceneReduce { StoryComposerDrawingReducer.colorSelected(it, colorHex) }

fun StoryComposerViewModel.onDrawWidthSelected(widthDesign: Double) = onSceneReduce { StoryComposerDrawingReducer.widthSelected(it, widthDesign) }

/** Commits a captured freehand stroke (design-space [points]); a tap is dropped. */
fun StoryComposerViewModel.onStrokeCaptured(points: List<StoryDrawingStrokePoint>) {
    val id = newStrokeId()
    val now = Instant.now().epochSecond.toDouble()
    onSceneReduce { StoryComposerDrawingReducer.captured(it, points, id, now) }
}

fun StoryComposerViewModel.onDrawUndo() = onSceneReduce { StoryComposerDrawingReducer.undone(it) }

fun StoryComposerViewModel.onDrawRedo() = onSceneReduce { StoryComposerDrawingReducer.redone(it) }

fun StoryComposerViewModel.onDrawBrushSelected(tool: StrokeTool) = onSceneReduce { StoryComposerDrawingReducer.brushSelected(it, tool) }

fun StoryComposerViewModel.onDrawSmoothingSelected(smoothing: StrokeSmoothing) = onSceneReduce { StoryComposerDrawingReducer.smoothingSelected(it, smoothing) }

fun StoryComposerViewModel.onDrawToolToggled(tool: DrawingEditTool) = onSceneReduce { StoryComposerDrawingReducer.toolToggled(it, tool) }

fun StoryComposerViewModel.onStrokeToolToggled(id: String, tool: DrawingEditTool) = onSceneReduce { StoryComposerDrawingReducer.strokeToolToggled(it, id, tool) }

fun StoryComposerViewModel.onStrokeDeleted(id: String) = onSceneReduce { StoryComposerDrawingReducer.strokeDeleted(it, id) }

/** The eraser gesture ([points] in design space); `true` when a stroke disappeared, so the edge can tick the haptic. */
fun StoryComposerViewModel.onEraseGesture(points: List<StoryDrawingStrokePoint>): Boolean {
    val before = state.value.drawingBoard.strokes.size
    onSceneReduce { StoryComposerDrawingReducer.erased(it, points.map { p -> StrokePoint(p.x, p.y) }) }
    return state.value.drawingBoard.strokes.size != before
}
