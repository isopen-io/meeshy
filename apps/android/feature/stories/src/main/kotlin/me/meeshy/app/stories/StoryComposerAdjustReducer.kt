package me.meeshy.app.stories

import me.meeshy.sdk.model.AdjustmentFamily
import me.meeshy.sdk.model.AdjustmentKind
import me.meeshy.sdk.model.ImageAdjustments

/**
 * Réducteurs purs des Réglages et des Effets d'un média de la scène (#13599, #13652) : le média POSÉ règle les siens, le
 * média de FOND aussi, comme iOS (`applyMediaObjectAdjustments` écrit sur l'objet, fond ou non). Chacun écrit sur son
 * média et sur lui seul ; un id qui n'est ni posé ni le fond que le plateau peint est inerte.
 */
internal object StoryComposerAdjustReducer {

    fun adjusted(state: StoryComposerUiState, mediaId: String, kind: AdjustmentKind, value: Float): StoryComposerUiState =
        when {
            state.isPlaced(mediaId) -> StoryComposerPlacedMediaReducer.adjusted(state, mediaId, kind, value)
            else -> backgroundWith(state, mediaId) { it.with(kind, value) }
        }

    fun reset(state: StoryComposerUiState, mediaId: String, family: AdjustmentFamily): StoryComposerUiState =
        when {
            state.isPlaced(mediaId) -> StoryComposerPlacedMediaReducer.adjustmentsReset(state, mediaId, family)
            else -> backgroundWith(state, mediaId) { it.resetting(family) }
        }

    private fun StoryComposerUiState.isPlaced(mediaId: String): Boolean = deck.selectedSlide.placedMedia.any { it.mediaId == mediaId }

    private fun backgroundWith(state: StoryComposerUiState, mediaId: String, change: (ImageAdjustments) -> ImageAdjustments): StoryComposerUiState {
        if (mediaId != state.sceneBackgroundMediaId) return state
        val next = change(state.deck.selectedSlide.backgroundAdjustments ?: ImageAdjustments.NEUTRAL)
        val deck = state.deck.setSelectedBackgroundAdjustments(mediaId, next)
        return if (deck === state.deck) state else state.withDeckTransform { deck }
    }
}
