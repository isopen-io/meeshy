package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectCaps
import kotlin.math.min

/**
 * **Dupliquer un objet posé, de quelque famille qu'il soit** (#13902, iOS `StoryComposerViewModel.duplicateElement` +
 * `StorySceneDuplicate`) : la copie porte un identifiant neuf, se pose décalée de sa source — assez pour qu'on VOIE la
 * duplication —, au-dessus de tout ce que la scène porte, et devient la sélection. Une copie de média nomme le MÊME fichier
 * (son `mediaId`, le `postMediaId` du fil) : rien n'est renvoyé ; une copie de son garde sa piste (`postMediaId`), sa durée
 * de source et sa transcription. Le texte et le sticker gardent leurs réducteurs. Même instance quand le geste ne copie rien
 * (objet inconnu, fond, plafond atteint) : l'historique ne prend pas de cran vide.
 */
internal object StoryComposerObjectCopyReducer {

    /** Le décalage d'une copie de média, de lieu ou de son (iOS `StorySceneDuplicate.shifted` : + 0,05, borné à 1). */
    private const val OFFSET = 0.05

    fun duplicated(state: StoryComposerUiState, ref: SceneObjectRef, newId: String): StoryComposerUiState = when (ref.kind) {
        ComposerObjectKind.TEXT -> StoryComposerTextReducer.duplicated(state, ref.id, newId)
        ComposerObjectKind.STICKER -> StoryComposerSceneReducer.stickerDuplicated(state, ref.id, newId)
        ComposerObjectKind.MEDIA -> media(state, ref.id, newId)
        ComposerObjectKind.PLACE -> place(state, ref.id, newId)
        ComposerObjectKind.AUDIO -> sound(state, ref.id, newId)
    }

    private fun media(state: StoryComposerUiState, id: String, newId: String): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        val source = slide.placedMedia.firstOrNull { it.id == id } ?: return state
        if (!state.canDuplicate(SceneObjectRef(ComposerObjectKind.MEDIA, id)) || slide.holdsMediaObject(newId)) return state
        val copy = source.copy(
            id = newId,
            x = shifted(source.x.toDouble()).toFloat(),
            y = shifted(source.y.toDouble()).toFloat(),
            zIndex = StorySceneStack.nextZ(slide),
        )
        val deck = state.deck.updatePlacedMedia(slide.id) { it + copy.normalised() }
        return StoryComposerSelectionReducer.mediaSelected(state.copy(deck = deck), newId)
    }

    private fun place(state: StoryComposerUiState, id: String, newId: String): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        val source = slide.places.firstOrNull { it.id == id } ?: return state
        if (!state.canDuplicate(SceneObjectRef(ComposerObjectKind.PLACE, id))) return state
        val deck = state.deck.addPlaceToSelected(source.copy(id = newId, x = shifted(source.x), y = shifted(source.y)))
        if (deck === state.deck) return state
        return StoryComposerReferencesReducer.selected(state.copy(deck = deck), newId)
    }

    private fun sound(state: StoryComposerUiState, id: String, newId: String): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        val source = slide.audio.firstOrNull { it.id == id } ?: return state
        if (!state.canDuplicate(SceneObjectRef(ComposerObjectKind.AUDIO, id)) || slide.audio.any { it.id == newId }) return state
        val copy = source.copy(id = newId, isBackground = null, x = shifted(source.x), y = shifted(source.y), zIndex = StorySceneStack.nextZ(slide))
        val next = slide.copy(
            audio = slide.audio + copy,
            soundSources = slide.soundSources[id]?.let { slide.soundSources + (newId to it) } ?: slide.soundSources,
            soundTranscriptions = slide.soundTranscriptions[id]?.let { slide.soundTranscriptions + (newId to it) } ?: slide.soundTranscriptions,
        )
        val deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) next else it })
        return StoryComposerSelectionReducer.soundSelected(state.copy(deck = deck), newId)
    }

    private fun shifted(value: Double): Double = min(1.0, value + OFFSET)
}

/**
 * L'objet [ref] peut-il être dupliqué ? Il est POSÉ sur la scène — un fond, média ou son d'ambiance, n'a pas de copie
 * (iOS : « jamais un fond — il deviendrait un second fond ») — et sa famille a encore une place sur la slide.
 */
internal fun StoryComposerUiState.canDuplicate(ref: SceneObjectRef): Boolean {
    val slide = deck.selectedSlide
    if (ref !in StorySceneStack.order(slide)) return false
    return when (ref.kind) {
        ComposerObjectKind.TEXT -> deck.selectedCanAddTextElement
        ComposerObjectKind.STICKER -> deck.selectedCanAddSticker
        ComposerObjectKind.PLACE -> deck.selectedCanAddPlace
        ComposerObjectKind.AUDIO -> canBorrowSound
        ComposerObjectKind.MEDIA -> SceneObjectCaps.canAddMedia(slide.placedMedia.size + slide.mediaIds.count { file -> slide.placedMedia.none { it.mediaId == file } })
    }
}
