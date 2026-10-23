package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
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
    )

    fun exited(state: StoryComposerUiState): StoryComposerUiState =
        if (!state.isDrawingActive) state else state.copy(isDrawingActive = false)

    fun colorSelected(state: StoryComposerUiState, colorHex: String): StoryComposerUiState =
        state.copy(drawColorHex = colorHex)

    fun widthSelected(state: StoryComposerUiState, widthDesign: Double): StoryComposerUiState =
        state.copy(drawWidthDesign = widthDesign)

    /**
     * Commits a captured stroke ([id] and [createdAtEpochSeconds] come from the impure edge).
     * Fewer than two points is a tap, not a drag, and is dropped.
     */
    fun captured(
        state: StoryComposerUiState,
        points: List<StoryDrawingStrokePoint>,
        id: String,
        createdAtEpochSeconds: Double,
    ): StoryComposerUiState {
        if (points.size < 2) return state
        val stroke = StoryDrawingStroke(
            id = id,
            points = points,
            colorHex = state.drawColorHex,
            width = state.drawWidthDesign,
            smoothing = StrokeSmoothing.CURVE,
            createdAt = createdAtEpochSeconds,
            captureVersion = 1,
        )
        return boardChanged(state) { it.commit(stroke) }
    }

    fun undone(state: StoryComposerUiState): StoryComposerUiState = boardChanged(state) { it.undo() }

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
