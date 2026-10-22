package me.meeshy.app.stories



/** Pure state-to-state reducers behind the composer's sticker intents (see [StoryComposerTextReducer]). */
internal object StoryComposerStickerReducer {

    /**
     * Adds an emoji sticker ([id] minted by the caller) to the selected slide and selects it,
     * clearing text editing. A blank emoji is ignored; the cap surfaces a warning instead.
     */
    fun added(state: StoryComposerUiState, emoji: String, id: String): StoryComposerUiState {
        if (emoji.isBlank()) return state
        if (!state.deck.selectedCanAddSticker) {
            return state.copy(errorMessage = StoryComposerViewModel.STICKER_LIMIT)
        }
        val at = state.deck.nextObjectPosition()
        return state.copy(
            deck = state.deck.addStickerToSelected(
                StoryStickerElement(id = id, emoji = emoji, x = at.x.toFloat(), y = at.y.toFloat()),
            ),
            selectedStickerId = id,
            selectedTextElementId = null,
            errorMessage = null,
        )
    }

    /** Selects [id] (inert when it is not on the selected slide); clears text editing. */
    fun selected(state: StoryComposerUiState, id: String): StoryComposerUiState =
        if (state.deck.selectedSlide.stickers.none { it.id == id }) state
        else state.copy(selectedStickerId = id, selectedTextElementId = null)

    /** Deselects the active sticker (inert when none is selected). */
    fun deselected(state: StoryComposerUiState): StoryComposerUiState =
        if (state.selectedStickerId == null) state else state.copy(selectedStickerId = null)

    /** Removes [id] from whichever slide holds it, clearing the selection if it was the one. */
    fun removed(state: StoryComposerUiState, id: String): StoryComposerUiState {
        val selected = if (state.selectedStickerId == id) null else state.selectedStickerId
        return state.copy(deck = state.deck.removeSticker(id), selectedStickerId = selected)
    }

    fun moved(state: StoryComposerUiState, id: String, dx: Float, dy: Float): StoryComposerUiState =
        state.copy(deck = state.deck.moveSticker(id, dx, dy))

    fun transformed(state: StoryComposerUiState, id: String, scaleBy: Float, rotateByDeg: Float): StoryComposerUiState =
        state.copy(deck = state.deck.transformSticker(id, scaleBy, rotateByDeg))
}
