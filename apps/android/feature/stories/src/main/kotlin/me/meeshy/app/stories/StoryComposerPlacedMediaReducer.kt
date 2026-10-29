package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryFilter

/**
 * Réducteurs purs des médias posés sur la scène (miroir du sticker) : poser au centre, déplacer, pivoter / agrandir,
 * reprendre. La pose vit dans la slide, donc l'historique du composeur l'annule et la rétablit avec le reste.
 */
internal object StoryComposerPlacedMediaReducer {

    /** Pose [mediaId] sur la scène de la slide choisie ; inerte si le média n'y est pas, est déjà posé ou est le fond. */
    fun placed(state: StoryComposerUiState, mediaId: String): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        if (mediaId !in slide.mediaIds || mediaId == slide.backgroundMediaId) return state
        if (slide.placedMedia.any { it.mediaId == mediaId }) return state
        val at = state.deck.nextObjectPosition()
        val placed = StoryPlacedMedia(mediaId = mediaId, x = at.x.toFloat(), y = at.y.toFloat())
        return state.copy(deck = state.deck.updatePlacedMedia(slide.id) { it + placed.normalised() })
    }

    /** Le geste de la vignette : poser un média qui ne l'est pas, reprendre la pose de celui qui l'est. */
    fun toggled(state: StoryComposerUiState, mediaId: String): StoryComposerUiState =
        if (state.deck.selectedSlide.placedMedia.any { it.mediaId == mediaId }) unplaced(state, mediaId) else placed(state, mediaId)

    /** Reprend la pose : le média reste attaché à la slide, il quitte la scène. */
    fun unplaced(state: StoryComposerUiState, mediaId: String): StoryComposerUiState {
        if (state.deck.slides.none { s -> s.placedMedia.any { it.mediaId == mediaId } }) return state
        return state.copy(deck = state.deck.updatePlacedMediaWhere({ s -> s.placedMedia.any { it.mediaId == mediaId } }) { list -> list.filterNot { it.mediaId == mediaId } })
    }

    fun moved(state: StoryComposerUiState, mediaId: String, dx: Float, dy: Float): StoryComposerUiState =
        rewritten(state, mediaId) { it.nudged(dx, dy) }

    fun transformed(state: StoryComposerUiState, mediaId: String, scaleBy: Float, rotateByDeg: Float): StoryComposerUiState =
        rewritten(state, mediaId) { it.transformed(scaleBy, rotateByDeg) }

    /** Règle le filtre propre de CE média posé, et de lui seul : la scène garde le sien ; inerte si le média n'est pas posé ou le filtre inchangé. */
    fun filtered(state: StoryComposerUiState, mediaId: String, filter: StoryFilter?): StoryComposerUiState {
        if (state.deck.slides.none { s -> s.placedMedia.any { it.mediaId == mediaId && it.filter != filter } }) return state
        return rewritten(state, mediaId) { it.copy(filter = filter) }
    }

    private fun rewritten(state: StoryComposerUiState, mediaId: String, change: (StoryPlacedMedia) -> StoryPlacedMedia): StoryComposerUiState {
        if (state.deck.slides.none { s -> s.placedMedia.any { it.mediaId == mediaId } }) return state
        return state.copy(
            deck = state.deck.updatePlacedMediaWhere({ s -> s.placedMedia.any { it.mediaId == mediaId } }) { list ->
                list.map { if (it.mediaId == mediaId) change(it).normalised() else it }
            },
        )
    }
}
