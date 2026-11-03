package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import me.meeshy.sdk.model.scene.StrokePoint

/** Les intentions du dessin à main levée posées par les bulles et la liste des traits ; chacune passe par [StoryComposerDrawingReducer]. */
internal fun StoryComposerViewModel.onDrawRedo() = onSceneReduce { StoryComposerDrawingReducer.redone(it) }

internal fun StoryComposerViewModel.onDrawBrushSelected(tool: StrokeTool) = onSceneReduce { StoryComposerDrawingReducer.brushSelected(it, tool) }

internal fun StoryComposerViewModel.onDrawSmoothingSelected(smoothing: StrokeSmoothing) =
    onSceneReduce { StoryComposerDrawingReducer.smoothingSelected(it, smoothing) }

internal fun StoryComposerViewModel.onDrawToolToggled(tool: DrawingEditTool) = onSceneReduce { StoryComposerDrawingReducer.toolToggled(it, tool) }

internal fun StoryComposerViewModel.onStrokeToolToggled(id: String, tool: DrawingEditTool) =
    onSceneReduce { StoryComposerDrawingReducer.strokeToolToggled(it, id, tool) }

internal fun StoryComposerViewModel.onStrokeDeleted(id: String) = onSceneReduce { StoryComposerDrawingReducer.strokeDeleted(it, id) }

/** The eraser gesture ([points] in design space); `true` when a stroke disappeared, so the edge can tick the haptic. */
internal fun StoryComposerViewModel.onEraseGesture(points: List<StoryDrawingStrokePoint>): Boolean {
    val before = state.value.drawingBoard.strokes.size
    onSceneReduce { StoryComposerDrawingReducer.erased(it, points.map { p -> StrokePoint(p.x, p.y) }) }
    return state.value.drawingBoard.strokes.size != before
}
