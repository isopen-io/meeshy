package me.meeshy.app.stories

import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectKind

/** Pure state-to-state reducers behind the composer's sticker intents (see [StoryComposerTextReducer]). */
internal object StoryComposerStickerReducer {

    /**
     * Adds an emoji sticker ([id] minted by the caller) to the selected slide and selects it,
     * clearing text editing. A blank emoji is ignored; the cap surfaces a warning instead.
     */
    fun added(state: StoryComposerUiState, emoji: String, id: String): StoryComposerUiState =
        if (emoji.isBlank()) state else posed(state, StoryStickerElement(id = id, emoji = emoji))

    /** Pose [sticker] (emoji, gabarit ou image, #13847) à la prochaine place libre et le sélectionne ; le plafond le dit. */
    fun posed(state: StoryComposerUiState, sticker: StoryStickerElement): StoryComposerUiState {
        if (!state.deck.selectedCanAddSticker) {
            return state.copy(errorMessage = StoryComposerViewModel.STICKER_LIMIT)
        }
        val at = state.deck.nextObjectPosition()
        return state.copy(
            deck = state.deck.addStickerToSelected(sticker.copy(x = at.x.toFloat(), y = at.y.toFloat())),
            selectedStickerId = sticker.id,
            selectedTextElementId = null,
            selectedMediaId = null, selectedSoundId = null, selectedPlaceId = null,
            errorMessage = null,
        )
    }

    /** Les octets d'un sticker image sont arrivés : il porte son média et l'adresse servie. */
    fun imageSettled(state: StoryComposerUiState, id: String, uploaded: UploadedMedia): StoryComposerUiState =
        state.copy(deck = state.deck.updateSticker(id) { it.copy(postMediaId = uploaded.id, imageUrl = uploaded.url) })

    /** L'image n'a pas pu partir : le sticker qui l'attendait quitte la scène, et l'échec est dit. */
    fun imageFailed(state: StoryComposerUiState, id: String): StoryComposerUiState =
        removed(state, id).copy(errorMessage = StoryComposerViewModel.STICKER_IMAGE_FAILED)

    /** The Edit of a sticker (#13836): its emoji swapped in place — position, size, rotation, window and selection kept. */
    fun swapped(state: StoryComposerUiState, id: String, emoji: String): StoryComposerUiState =
        if (emoji.isBlank() || state.deck.selectedSlide.stickers.none { it.id == id }) state
        else state.copy(deck = state.deck.updateSticker(id) { it.copy(emoji = emoji) })

    /** Selects [id], brought to the front of the scene ([SceneFrontPromotion], #13917); inert when it is not on the selected slide; clears text editing. */
    fun selected(state: StoryComposerUiState, id: String): StoryComposerUiState =
        if (state.deck.selectedSlide.stickers.none { it.id == id }) state
        else SceneFrontPromotion.promoted(state, SceneObjectRef(ComposerObjectKind.STICKER, id)).copy(selectedStickerId = id, selectedTextElementId = null, selectedMediaId = null, selectedSoundId = null, selectedPlaceId = null)

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

    /** Le départ du sticker avance d'un cran (iOS : section Temps), comme celui d'un texte. */
    fun startCycled(state: StoryComposerUiState, id: String): StoryComposerUiState =
        state.copy(deck = state.deck.updateSticker(id) { it.copy(timing = it.timing.cycledStart()) })

    /** La durée du sticker avance d'un cran ; le départ est intact. */
    fun durationCycled(state: StoryComposerUiState, id: String): StoryComposerUiState =
        state.copy(deck = state.deck.updateSticker(id) { it.copy(timing = it.timing.cycledDuration()) })
}
