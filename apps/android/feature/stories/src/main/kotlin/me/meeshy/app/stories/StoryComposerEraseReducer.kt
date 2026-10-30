package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerBandState

/**
 * Ce que le « ⋯ » retire de la scène (#13845, miroir de `ComposerOverflowPolicy` et `MeeshyComposerHost+Overflow` iOS) :
 * une diapo, le fond, ou tout. Pur — le view model ne fait qu'enterrer les envois hors ligne qui partent et inscrire le
 * cran d'historique, pour que ↶ Défaire rétablisse ce qui est parti, médias compris.
 */
internal object StoryComposerEraseReducer {

    /** Une composition vierge n'a rien à effacer : une seule diapo, et rien n'y a été posé ni réglé. */
    fun hasSomethingToErase(state: StoryComposerUiState): Boolean =
        state.deck.size > 1 || state.deck.slides.any { it != StorySlide(id = it.id) }

    /** La diapo sélectionnée porte une couleur de fond ou un média désigné comme fond. */
    fun hasBackground(state: StoryComposerUiState): Boolean =
        state.deck.selectedSlide.background != null || state.deck.selectedSlideBackgroundMediaId != null

    /**
     * Choisir un média comme fond n'a de sens que là où la porte Média ne l'atteint plus : sur une diapo sans média, le
     * premier choisi se peint déjà en fond. Une place doit rester, et aucun envoi n'est en cours.
     */
    fun canPickBackground(state: StoryComposerUiState): Boolean =
        state.deck.selectedSlide.mediaIds.isNotEmpty() && state.deck.selectedCanAddMedia && !state.isUploadingMedia

    /**
     * Tout effacer : une seule diapo vierge, qui garde l'identifiant de la diapo sélectionnée (une story publiée rouverte
     * reste la même), sur le fond neutre — aucune couleur résiduelle. Médias, sélections, panneau ouvert et menus partent, et
     * les personnes nommées avec eux (iOS #5013 : la publication suivante ne notifie personne qu'aucune scène ne montre) ;
     * l'audience reste, c'est un réglage de la publication et non un contenu.
     */
    fun cleared(state: StoryComposerUiState): StoryComposerUiState =
        state.withDeckTransform { StorySlideDeck.single(it.selectedId) }.let { blank ->
            blank.copy(draft = blank.draft.copy(mentions = emptyList()))
        }.copy(
            attachments = emptyList(),
            pendingUploads = emptyList(),
            framedTextElementId = null,
            elementMenuId = null,
            stickerMenuId = null,
            snapFeedback = null,
            band = ComposerBandState.Hidden,
            playheadSeconds = 0f,
            openObjectSection = null,
            openSceneEffect = null,
            isFrameOpen = false,
        )

    /** Retire la diapo [id] (inerte sur la dernière) ; ses médias quittent les réserves, sauf ceux qu'un duplicata partage. */
    fun slideRemoved(state: StoryComposerUiState, id: String): StoryComposerUiState {
        val after = state.deck.removeSlide(id)
        if (after === state.deck) return state
        val kept = after.slides.flatMapTo(mutableSetOf()) { it.mediaIds }
        val dropped = state.deck.slides.flatMap { it.mediaIds }.filterNot { it in kept }.toSet()
        return state.copy(
            deck = after,
            attachments = state.attachments.filterNot { it.id in dropped },
            pendingUploads = state.pendingUploads.filterNot { it.cmid in dropped },
        ).mirrorDraftToSelection()
    }
}
