package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerObjectTiming
import me.meeshy.sdk.model.scene.StoryElementTiming

/**
 * **Le Temps de l'objet sélectionné, quelle que soit sa famille** (#13902, iOS `ComposerInlineEditing.chips(.time)`) : sa
 * fenêtre d'apparition dans la durée de la slide, écrite dans les champs que les lecteurs jouent déjà — `startTime` /
 * `duration` du texte, du sticker, du média posé (`mediaObjects[]`), du lieu (`locationObjects[]`) et du son
 * (`audioPlayerObjects[]`), que `SceneRenderPlanner` et iOS `StoryRenderer` lisent. Un fond n'en a pas : il dure la slide.
 */
internal val StoryComposerUiState.selectedObjectTiming: StoryElementTiming?
    get() {
        val ref = selectedSceneObject?.takeIf { it in StorySceneStack.order(deck.selectedSlide) } ?: return null
        val slide = deck.selectedSlide
        return when (ref.kind) {
            ComposerObjectKind.TEXT -> slide.elements.firstOrNull { it.id == ref.id }?.timing
            ComposerObjectKind.STICKER -> slide.stickers.firstOrNull { it.id == ref.id }?.timing
            ComposerObjectKind.MEDIA -> slide.placedMedia.firstOrNull { it.id == ref.id }?.timing
            ComposerObjectKind.PLACE -> slide.places.firstOrNull { it.id == ref.id }?.timing()
            ComposerObjectKind.AUDIO -> slide.audio.firstOrNull { it.id == ref.id }?.timing()
        }
    }

/** La fenêtre d'un lieu : son départ et sa durée, 0 / 0 quand il vit toute la slide. */
internal fun StoryLocationObject.timing(): StoryElementTiming =
    StoryElementTiming(startTime?.toFloat() ?: StoryElementTiming.NONE_SECONDS, duration?.toFloat() ?: StoryElementTiming.NONE_SECONDS)

/** Les deux gestes de la feuille Temps : le départ avance d'un cran, ou la durée ; l'autre borne ne bouge pas. */
internal object StoryComposerObjectTimeReducer {

    fun startCycled(state: StoryComposerUiState, ref: SceneObjectRef): StoryComposerUiState = when (ref.kind) {
        ComposerObjectKind.TEXT -> StoryComposerTextReducer.startCycled(state, ref.id)
        ComposerObjectKind.STICKER -> StoryComposerStickerReducer.startCycled(state, ref.id)
        ComposerObjectKind.AUDIO -> StoryComposerSelectionReducer.soundStartCycled(state, ref.id)
        ComposerObjectKind.MEDIA -> StoryComposerPlacedMediaReducer.windowed(state, ref.id) { it.cycledStart() }
        ComposerObjectKind.PLACE -> placeWindowed(state, ref.id) { it.cycledStart() }
    }

    fun durationCycled(state: StoryComposerUiState, ref: SceneObjectRef): StoryComposerUiState = when (ref.kind) {
        ComposerObjectKind.TEXT -> StoryComposerTextReducer.durationCycled(state, ref.id)
        ComposerObjectKind.STICKER -> StoryComposerStickerReducer.durationCycled(state, ref.id)
        ComposerObjectKind.AUDIO -> StoryComposerSelectionReducer.soundDurationCycled(state, ref.id)
        ComposerObjectKind.MEDIA -> StoryComposerPlacedMediaReducer.windowed(state, ref.id) { it.cycledDuration() }
        ComposerObjectKind.PLACE -> placeWindowed(state, ref.id) { it.cycledDuration() }
    }

    /** La fenêtre réglée dans la feuille (début / fin), rangée en départ + durée ; permanent garde la durée ouverte. */
    fun windowed(state: StoryComposerUiState, ref: SceneObjectRef, window: ComposerObjectTiming): StoryComposerUiState =
        retimed(state, ref) {
            StoryElementTiming((window.storedStartTime ?: 0.0).toFloat(), (window.storedDuration ?: 0.0).toFloat())
        }

    /** La fenêtre d'un objet posé, de quelque famille qu'il soit, réécrite par [change] ; inerte pour un objet absent. */
    fun retimed(state: StoryComposerUiState, ref: SceneObjectRef, change: (StoryElementTiming) -> StoryElementTiming): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        return when (ref.kind) {
            ComposerObjectKind.TEXT ->
                if (slide.elements.none { it.id == ref.id }) state
                else state.copy(deck = state.deck.updateTextElement(ref.id) { it.copy(timing = change(it.timing)) })
            ComposerObjectKind.STICKER ->
                if (slide.stickers.none { it.id == ref.id }) state
                else state.copy(deck = state.deck.updateSticker(ref.id) { it.copy(timing = change(it.timing)) })
            ComposerObjectKind.AUDIO -> StoryComposerSelectionReducer.soundRetimed(state, ref.id, change)
            ComposerObjectKind.MEDIA -> StoryComposerPlacedMediaReducer.windowed(state, ref.id, change)
            ComposerObjectKind.PLACE -> placeWindowed(state, ref.id, change)
        }
    }

    private fun placeWindowed(state: StoryComposerUiState, id: String, change: (StoryElementTiming) -> StoryElementTiming): StoryComposerUiState {
        if (state.deck.selectedSlide.places.none { it.id == id }) return state
        return state.copy(
            deck = state.deck.updatePlace(id) { place ->
                val next = change(place.timing())
                place.copy(
                    startTime = next.startSeconds.takeIf { next.hasStart }?.toDouble(),
                    duration = next.durationSeconds.takeIf { next.isTimed }?.toDouble(),
                )
            },
        )
    }
}
