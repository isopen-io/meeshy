package me.meeshy.app.stories

import me.meeshy.sdk.model.scene.StoryElementTiming

/** Réducteurs de l'éditeur de scène : fenêtres d'objet, menu d'appui long des stickers, frise. */
internal object StoryComposerSceneReducer {

    /** Pose la fenêtre [startSeconds] / [durationSeconds] (0 = permanent) d'un texte ou d'un sticker. */
    fun windowed(state: StoryComposerUiState, id: String, startSeconds: Float, durationSeconds: Float): StoryComposerUiState {
        val timing = StoryElementTiming(startSeconds.coerceAtLeast(0f), durationSeconds.coerceAtLeast(0f))
        val slide = state.deck.selectedSlide
        val deck = when {
            slide.elements.any { it.id == id } -> state.deck.updateTextElement(id) { it.copy(timing = timing) }
            slide.stickers.any { it.id == id } -> state.deck.updateSticker(id) { it.copy(timing = timing) }
            else -> return state
        }
        return state.copy(deck = deck)
    }

    fun stickerMenuOpened(state: StoryComposerUiState, id: String): StoryComposerUiState =
        if (state.deck.selectedSlide.stickers.none { it.id == id }) state
        else state.copy(stickerMenuId = id, selectedStickerId = id, selectedTextElementId = null, elementMenuId = null)

    fun menuDismissed(state: StoryComposerUiState): StoryComposerUiState =
        if (state.stickerMenuId == null && state.elementMenuId == null) state
        else state.copy(stickerMenuId = null, elementMenuId = null)

    fun stickerDuplicated(state: StoryComposerUiState, id: String, newId: String): StoryComposerUiState {
        if (state.deck.selectedSlide.stickers.none { it.id == id }) return state
        if (!state.deck.selectedCanAddSticker) return state.copy(errorMessage = StoryComposerViewModel.STICKER_LIMIT)
        return state.copy(
            deck = state.deck.duplicateSticker(id, newId, StoryComposerTextReducer.DUPLICATE_ELEMENT_OFFSET, StoryComposerTextReducer.DUPLICATE_ELEMENT_OFFSET),
            selectedStickerId = newId,
            selectedTextElementId = null,
            errorMessage = null,
        )
    }

    fun stickerReordered(state: StoryComposerUiState, id: String, op: StoryZOrder): StoryComposerUiState {
        val deck = state.deck.reorderSticker(id, op)
        return if (deck === state.deck) state else state.copy(deck = deck)
    }

    fun playheadMoved(state: StoryComposerUiState, seconds: Float): StoryComposerUiState =
        state.copy(playheadSeconds = seconds.coerceIn(0f, state.selectedSlideDurationSeconds.toFloat()))

    /** Toucher une piste sélectionne son objet sur la scène (texte ou sticker, inerte sinon). */
    fun trackSelected(state: StoryComposerUiState, id: String): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        return when {
            slide.elements.any { it.id == id } -> StoryComposerTextReducer.selected(state, id)
            slide.stickers.any { it.id == id } -> StoryComposerStickerReducer.selected(state, id)
            else -> state
        }
    }
}
