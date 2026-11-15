package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import me.meeshy.sdk.model.scene.StrokeCapture
import me.meeshy.sdk.model.scene.StrokePoint
import me.meeshy.sdk.model.composer.ComposerBandState


/** Pure state-to-state reducers behind the composer's freehand-drawing intents (see [StoryComposerTextReducer]). */
internal object StoryComposerDrawingReducer {

    /** Enters the drawing tool: closes the band and clears every selection so the capture layer is free. */
    fun entered(state: StoryComposerUiState): StoryComposerUiState = state.copy(
        isDrawingActive = true,
        band = ComposerBandState.Hidden,
        selectedTextElementId = null,
        selectedStickerId = null,
        elementMenuId = null,
        stickerMenuId = null,
    )

    fun exited(state: StoryComposerUiState): StoryComposerUiState =
        if (!state.isDrawingActive) state else state.copy(
            isDrawingActive = false,
            drawingExpandedTool = null,
            drawingBoard = state.drawingBoard.select(null),
        )

    /** Colour of the selected stroke when there is one (the user edits THE STROKE), of the brush otherwise. */
    fun colorSelected(state: StoryComposerUiState, colorHex: String): StoryComposerUiState =
        if (state.drawingBoard.selectedStrokeId != null) boardChanged(state) { it.recolorSelected(colorHex) }
        else state.copy(drawColorHex = colorHex)

    fun widthSelected(state: StoryComposerUiState, widthDesign: Double): StoryComposerUiState {
        val width = StoryDrawingPalette.clampWidth(widthDesign)
        return if (state.drawingBoard.selectedStrokeId != null) boardChanged(state) { it.resizeSelected(width) }
        else state.copy(drawWidthDesign = width)
    }

    fun smoothingSelected(state: StoryComposerUiState, smoothing: StrokeSmoothing): StoryComposerUiState =
        if (state.drawingBoard.selectedStrokeId != null) boardChanged(state) { it.smoothSelected(smoothing) }
        else state.copy(drawSmoothing = smoothing)

    /** Picking a brush leaves per-stroke editing and hands the canvas back to the capture layer (iOS immersive drawing). */
    fun brushSelected(state: StoryComposerUiState, tool: StrokeTool): StoryComposerUiState =
        state.copy(drawTool = tool, drawingBoard = state.drawingBoard.select(null))

    /** A bubble opens its panel for the BRUSH: it leaves any per-stroke editing (the list row hosts that one). */
    fun toolToggled(state: StoryComposerUiState, tool: DrawingEditTool): StoryComposerUiState {
        val folds = state.drawingBoard.selectedStrokeId == null && tool == state.drawingExpandedTool
        return state.copy(
            drawingBoard = state.drawingBoard.select(null),
            drawingExpandedTool = tool.takeUnless { folds },
        )
    }

    /** Selecting a stroke edits THAT stroke; the tapped option panel opens on [tool] (re-tap folds it). */
    fun strokeToolToggled(state: StoryComposerUiState, id: String, tool: DrawingEditTool): StoryComposerUiState {
        val reopened = state.drawingBoard.selectedStrokeId == id && state.drawingExpandedTool == tool
        return state.copy(
            drawingBoard = state.drawingBoard.select(id),
            drawingExpandedTool = tool.takeUnless { reopened },
        )
    }

    fun strokeDeleted(state: StoryComposerUiState, id: String): StoryComposerUiState =
        boardChanged(state) { it.delete(id) }

    /**
     * Commits a captured stroke ([id] and [createdAtEpochSeconds] come from the impure edge). A lone point is a TAP and
     * commits a disc; the eraser never commits anything. The brush (tool, colour, width, smoothing) comes from the state.
     */
    fun captured(
        state: StoryComposerUiState,
        points: List<StoryDrawingStrokePoint>,
        id: String,
        createdAtEpochSeconds: Double,
    ): StoryComposerUiState {
        if (points.isEmpty() || state.drawTool == StrokeTool.ERASER) return state
        val stroke = StoryDrawingStroke(
            id = id,
            points = points,
            colorHex = state.drawColorHex,
            width = state.drawWidthDesign,
            tool = state.drawTool,
            smoothing = state.drawSmoothing,
            createdAt = createdAtEpochSeconds,
            captureVersion = StrokeCapture.CAPTURE_VERSION,
        )
        return boardChanged(state) { it.commit(stroke).select(null) }
    }

    /** The eraser gesture: strokes grazed by [points] disappear, nothing is created. */
    fun erased(state: StoryComposerUiState, points: List<StrokePoint>): StoryComposerUiState {
        val board = state.drawingBoard.erase(points)
        return if (board === state.drawingBoard) state else boardChanged(state) { board }
    }

    fun undone(state: StoryComposerUiState): StoryComposerUiState = boardChanged(state) { it.undo() }

    fun redone(state: StoryComposerUiState): StoryComposerUiState = boardChanged(state) { it.redo() }

    /** Applies a board mutation and mirrors its strokes onto the selected slide. */
    private fun boardChanged(
        state: StoryComposerUiState,
        transform: (StoryDrawingBoard) -> StoryDrawingBoard,
    ): StoryComposerUiState {
        val board = transform(state.drawingBoard)
        return state.copy(
            drawingBoard = board,
            deck = state.deck.setSelectedStrokes(board.strokes),
        ).mirrorDraftToSelection()
    }
}
