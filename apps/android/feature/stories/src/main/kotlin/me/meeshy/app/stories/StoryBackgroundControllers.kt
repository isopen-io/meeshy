package me.meeshy.app.stories

/**
 * Le fond média SÉLECTIONNÉ (grammaire d'édition, #13973) : toucher ou tenir le fond peint le sélectionne et pose son
 * niveau « Fond » ; toucher la scène quand quelque chose est sélectionné ressort de tout. Mettre sur la scène fait du fond
 * un objet posé, sélectionné aussitôt ; un fond remplacé quitte la diapo dès que son successeur est arrivé.
 */
internal object StoryComposerBackgroundSelectionReducer {

    fun selected(state: StoryComposerUiState): StoryComposerUiState =
        state.selectedSlideBackdropMediaId?.let { StoryComposerSelectionReducer.mediaSelected(state, it) } ?: state

    fun tapped(state: StoryComposerUiState): StoryComposerUiState =
        if (state.selectedSceneObject != null) StoryComposerSelectionReducer.cleared(state) else selected(state)

    fun putOnScene(state: StoryComposerUiState): StoryComposerUiState {
        val id = state.selectedSlideBackdropMediaId ?: return state
        val freed = if (state.deck.selectedSlideBackgroundMediaId == id) StoryComposerBackgroundReducer.backgroundMediaToggled(state, id) else state
        val placed = StoryComposerPlacedMediaReducer.placed(freed, id)
        val objectId = placed.deck.selectedSlide.placedMedia.lastOrNull { it.mediaId == id }?.id ?: return state
        return StoryComposerSelectionReducer.mediaSelected(placed, objectId)
    }

    /**
     * Le fond [old] que « Remplacer » a remplacé quitte la diapo, une fois le nouveau peint à sa place ; s'il était
     * sélectionné, la sélection passe au nouveau fond. Inerte tant qu'il est encore peint, posé sur la scène ou en attente
     * d'envoi, et il ne quitte les envois que si aucune autre diapo ne le montre.
     */
    fun retired(state: StoryComposerUiState, old: String): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        val keeps = old !in slide.mediaIds || old == state.selectedSlideBackdropMediaId || slide.placedMedia.any { it.mediaId == old } ||
            state.pendingUploads.any { it.cmid == old }
        if (keeps) return state
        val slides = state.deck.slides.map { if (it.id == slide.id) it.copy(mediaIds = it.mediaIds - old) else it }
        val elsewhere = slides.any { old in it.mediaIds }
        val next = state.copy(
            deck = state.deck.copy(slides = slides),
            attachments = if (elsewhere) state.attachments else state.attachments.filterNot { it.id == old },
            selectedMediaId = if (state.selectedMediaId == old) state.selectedSlideBackdropMediaIdAfter(slides) else state.selectedMediaId,
        )
        return next.withDescriptionsPruned().mirrorDraftToSelection()
    }

    private fun StoryComposerUiState.selectedSlideBackdropMediaIdAfter(slides: List<StorySlide>): String? =
        copy(deck = deck.copy(slides = slides)).selectedSlideBackdropMediaId
}

/** Toucher la scène, hors de tout objet : ressortir de la sélection, ou sélectionner le fond média peint. */
internal fun StoryComposerViewModel.onSceneTap() = onSceneReduce(StoryComposerBackgroundSelectionReducer::tapped)

/** L'appui long sur le fond média, ou la vignette de diapo › Fond : le fond est sélectionné, son niveau « Fond » se pose. */
internal fun StoryComposerViewModel.onSelectBackground() = onSceneReduce(StoryComposerBackgroundSelectionReducer::selected)

/** « Mettre sur la scène » : le fond devient un objet posé, sélectionné ; un cran d'historique. */
internal fun StoryComposerViewModel.onPutBackgroundOnScene() = onSceneReduce(StoryComposerBackgroundSelectionReducer::putOnScene)

/** « Retirer », confirmé : le fond quitte la diapo et la sélection tombe avec lui ; ↶ le ramène. */
internal fun StoryComposerViewModel.onRemoveSelectedBackground() {
    val id = state.value.selectedSlideBackdropMediaId ?: return
    onSceneBackgroundTap()
    onRemoveMedia(id)
}
