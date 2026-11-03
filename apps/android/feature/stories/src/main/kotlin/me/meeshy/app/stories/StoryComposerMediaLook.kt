package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.composer.look.ComposerLookStripItem
import me.meeshy.sdk.model.composer.look.StoryMediaLookMapping

/**
 * **LE LOOK D'UN MÉDIA DE LA SCÈNE, RÉGLAGE JUSQU'À LA PUBLICATION** (#13841, miroir de `StoryMediaObject.look` iOS,
 * #13840). Filtre, effet et cadre de l'appel s'écrivent sur la DIAPO, par identifiant de média — même id, même fichier :
 * rien n'est cuit avant la publication, l'historique les couvre, le brouillon les garde, la scène les peint en direct.
 */

/** Le look du média [id] de la diapo choisie ; `null` : aucun. */
internal fun StoryComposerUiState.mediaLookOf(id: String): StoryMediaLook? = deck.selectedSlide.let { it.mediaLooks[it.mediaFileOf(id)] }

/** Le look du média que le plateau peint en FOND ; pendant « Comparer » ([comparing] = le fond), son original. */
internal fun StoryComposerUiState.backgroundMediaLook(comparing: String?): StoryMediaLook? {
    val id = selectedSlideBackdropMediaId ?: return null
    return if (id == comparing) null else mediaLookOf(id)?.paintedOn(video = placedMediaIsVideo(id))
}

/**
 * Ce qu'un média peint de son look : tout, pour une image ; pour une vidéo, ce que le GPU en grave — sans l'effet de
 * visage, qu'elle ne peint pas ([StoryMediaLookMapping.videoLook]). `null` : rien.
 */
internal fun StoryMediaLook.paintedOn(video: Boolean): StoryMediaLook? =
    if (video) copy(faceEffect = null).takeIf(StoryMediaLookMapping::videoPaints) else takeIf(StoryMediaLookMapping::paints)

/**
 * Les filtres et cadres de l'appel s'offrent à tout média de la diapo, image ou vidéo, posé ou de fond : la publication
 * sait cuire l'un et l'autre (loi 4 : aucun bouton dont l'effet n'atteindrait pas les lecteurs).
 */
internal fun StoryComposerUiState.offersLook(id: String): Boolean =
    deck.selectedSlide.mediaFileOf(id) in deck.selectedSlide.mediaIds

/** Le look [look] posé sur le média [mediaId] de la diapo choisie ; un look neutre s'efface. */
internal fun StorySlideDeck.withSelectedMediaLook(objectId: String, look: StoryMediaLook?): StorySlideDeck {
    val slide = selectedSlide
    val mediaId = slide.mediaFileOf(objectId)
    if (mediaId !in slide.mediaIds) return this
    val kept = look?.normalized
    if (slide.mediaLooks[mediaId] == kept) return this
    val looks = if (kept == null) slide.mediaLooks - mediaId else slide.mediaLooks + (mediaId to kept)
    return copy(slides = slides.map { if (it.id == slide.id) it.copy(mediaLooks = looks) else it })
}

/** Les gestes de la section « Filtres et cadres » d'un média. */
internal object StoryComposerLookReducer {

    /** Toucher une case : sa famille change, les autres restent ; inerte pour un média absent ou une case déjà choisie. */
    fun chosen(state: StoryComposerUiState, mediaId: String, item: ComposerLookStripItem): StoryComposerUiState {
        if (!state.deck.selectedSlide.holdsMediaObject(mediaId)) return state
        val next = StoryMediaLookMapping.choosing(item, state.mediaLookOf(mediaId))
        val deck = state.deck.withSelectedMediaLook(mediaId, next)
        return if (deck === state.deck) state else state.copy(deck = deck)
    }
}
