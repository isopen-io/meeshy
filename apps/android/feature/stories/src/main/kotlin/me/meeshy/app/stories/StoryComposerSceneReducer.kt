package me.meeshy.app.stories

import me.meeshy.sdk.model.SceneEntryWindow
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.sdk.model.composer.timeline.ClipWindowResolver
import me.meeshy.sdk.model.composer.timeline.FriseBarDrag
import me.meeshy.sdk.model.composer.timeline.TrackBar
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
        else SceneFrontPromotion.promoted(state, SceneObjectRef(ComposerObjectKind.STICKER, id)).copy(stickerMenuId = id, selectedStickerId = id, selectedTextElementId = null, elementMenuId = null, selectedMediaId = null, selectedSoundId = null, selectedPlaceId = null)

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

    /**
     * **« Couper » à la tête** (#14221, iso iOS `splitSelectedAtPlayhead`) : un TEXTE devient deux objets qui se suivent,
     * au même endroit, l'original jusqu'à la tête, sa copie [newId] après ; une seule réduction, donc un seul pas
     * d'annulation. La tête hors de la fenêtre, ou une autre famille, ne coupe rien.
     */
    fun textSplit(state: StoryComposerUiState, id: String, newId: String): StoryComposerUiState {
        if (state.deck.selectedSlide.elements.none { it.id == id }) return state
        val slide = state.selectedSlideDurationSeconds.toFloat()
        val window = when (val bar = state.sceneTracks.firstOrNull { it.id == id }?.bar) {
            is TrackBar.Timed -> ClipWindowResolver.Window(bar.start.toFloat(), (bar.end - bar.start).toFloat())
            else -> ClipWindowResolver.Window(0f, slide)
        }
        val at = state.playheadSeconds
        if (!FriseBarDrag.canSplit(window, at)) return state
        if (!state.deck.selectedCanAddTextElement) return state.copy(errorMessage = StoryComposerViewModel.TEXT_ELEMENT_LIMIT)
        val left = FriseBarDrag.stored(ClipWindowResolver.Window(window.start, at - window.start), slide)
        val right = FriseBarDrag.stored(ClipWindowResolver.Window(at, window.end - at), slide)
        val duplicated = state.copy(deck = state.deck.duplicateTextElement(id, newId, 0f, 0f))
        return windowed(windowed(duplicated, id, left.startSeconds, left.durationSeconds), newId, right.startSeconds, right.durationSeconds)
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
