package me.meeshy.app.stories

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

    /** Reprend la pose : le média reste attaché à la slide, il quitte la scène. */
    fun unplaced(state: StoryComposerUiState, mediaId: String): StoryComposerUiState {
        if (state.deck.slides.none { s -> s.placedMedia.any { it.mediaId == mediaId } }) return state
        return state.copy(deck = state.deck.updatePlacedMediaWhere({ s -> s.placedMedia.any { it.mediaId == mediaId } }) { list -> list.filterNot { it.mediaId == mediaId } })
    }

    fun moved(state: StoryComposerUiState, mediaId: String, dx: Float, dy: Float): StoryComposerUiState =
        rewritten(state, mediaId) { it.nudged(dx, dy) }

    fun transformed(state: StoryComposerUiState, mediaId: String, scaleBy: Float, rotateByDeg: Float): StoryComposerUiState =
        rewritten(state, mediaId) { it.transformed(scaleBy, rotateByDeg) }

    private fun rewritten(state: StoryComposerUiState, mediaId: String, change: (StoryPlacedMedia) -> StoryPlacedMedia): StoryComposerUiState {
        if (state.deck.slides.none { s -> s.placedMedia.any { it.mediaId == mediaId } }) return state
        return state.copy(
            deck = state.deck.updatePlacedMediaWhere({ s -> s.placedMedia.any { it.mediaId == mediaId } }) { list ->
                list.map { if (it.mediaId == mediaId) change(it).normalised() else it }
            },
        )
    }
}
