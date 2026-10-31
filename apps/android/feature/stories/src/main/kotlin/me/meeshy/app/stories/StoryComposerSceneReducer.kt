package me.meeshy.app.stories

import me.meeshy.sdk.model.SceneEntryWindow
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.sdk.model.scene.StoryElementTiming

/** Réducteurs de l'éditeur de scène : fenêtres d'objet, menu d'appui long des stickers, frise. */
internal object StoryComposerSceneReducer {

    /** Pose la fenêtre [startSeconds] / [durationSeconds] (0 = permanent) de l'objet posé [id], de quelque famille qu'il soit (#13904). */
    fun windowed(state: StoryComposerUiState, id: String, startSeconds: Float, durationSeconds: Float): StoryComposerUiState {
        val ref = StorySceneStack.order(state.deck.selectedSlide).firstOrNull { it.id == id } ?: return state
        val timing = StoryElementTiming(startSeconds.coerceAtLeast(0f), durationSeconds.coerceAtLeast(0f))
        return StoryComposerObjectTimeReducer.retimed(state, ref) { timing }
    }

    fun stickerMenuOpened(state: StoryComposerUiState, id: String): StoryComposerUiState =
        if (state.deck.selectedSlide.stickers.none { it.id == id }) state
        else state.copy(stickerMenuId = id, selectedStickerId = id, selectedTextElementId = null, elementMenuId = null, selectedMediaId = null, selectedSoundId = null, selectedPlaceId = null)

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

    fun stickerReordered(state: StoryComposerUiState, id: String, op: StoryZOrder): StoryComposerUiState =
        restacked(state, SceneObjectRef(ComposerObjectKind.STICKER, id), op)

    /** L'Ordre d'un objet de la scène, quelle que soit sa famille (#13852) : même instance quand rien ne change. */
    fun restacked(state: StoryComposerUiState, ref: SceneObjectRef, op: StoryZOrder): StoryComposerUiState {
        val deck = state.deck.restacked(ref, op)
        return if (deck === state.deck) state else state.copy(deck = deck)
    }

    fun playheadMoved(state: StoryComposerUiState, seconds: Float): StoryComposerUiState =
        state.copy(playheadSeconds = seconds.coerceIn(0f, state.selectedSlideDurationSeconds.toFloat()))

    /** Toucher une piste sélectionne son objet sur la scène, de quelque famille qu'il soit (#13904) ; inerte pour le fond. */
    fun trackSelected(state: StoryComposerUiState, id: String): StoryComposerUiState {
        val ref = StorySceneStack.order(state.deck.selectedSlide).firstOrNull { it.id == id } ?: return state
        return when (ref.kind) {
            ComposerObjectKind.TEXT -> StoryComposerTextReducer.selected(state, id).copy(framedTextElementId = id)
            ComposerObjectKind.STICKER -> StoryComposerStickerReducer.selected(state, id)
            ComposerObjectKind.MEDIA -> StoryComposerSelectionReducer.mediaSelected(state, id)
            ComposerObjectKind.PLACE -> StoryComposerReferencesReducer.selected(state, id)
            ComposerObjectKind.AUDIO -> StoryComposerSelectionReducer.soundSelected(state, id)
        }
    }

    /**
     * **Animé** (miroir de `toggleSceneAnimation` iOS, #8415) : allumer rend la scène animée ET ouvre sa frise, la tête
     * à zéro ; éteindre referme la frise et rend la scène statique.
     */
    fun animationToggled(state: StoryComposerUiState): StoryComposerUiState =
        if (state.sceneIsAnimated) {
            state.copy(sceneIsAnimated = false, band = state.band.closeAnyPanel())
        } else {
            state.copy(
                sceneIsAnimated = true,
                band = state.band.swipeUpOnTool(StoryToolMode.TIMELINE),
                playheadSeconds = 0f,
            )
        }

    /**
     * **Un objet posé sur une scène animée ENTRE À LA TÊTE** (miroir de `placeNewSceneObjectsAtPlayhead`), au plus tard à
     * 80 % de la durée, et reste jusqu'à la fin. Statique, la scène garde ses objets sur toute la slide.
     */
    fun placedAtPlayhead(
        state: StoryComposerUiState,
        place: (StoryComposerUiState) -> StoryComposerUiState,
    ): StoryComposerUiState {
        val placed = place(state)
        if (!state.sceneIsAnimated) return placed
        val known = state.deck.selectedSlide.let { slide -> slide.elements.map { it.id } + slide.stickers.map { it.id } }.toSet()
        val slide = placed.deck.selectedSlide
        val fresh = (slide.elements.map { it.id } + slide.stickers.map { it.id }).filterNot { it in known }
        val window = SceneEntryWindow.forNewObject(state.playheadSeconds.toDouble(), placed.deck.selectedSlideDurationSeconds)
        return fresh.fold(placed) { acc, id ->
            windowed(acc, id, window.start.toFloat(), window.duration.toFloat())
        }
    }
}
