package me.meeshy.app.stories

import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.look.StoryMediaLookMapping

/**
 * Une image réglée que la publication doit cuire : son look, et son original — envoyé ([uploaded]) ou encore en attente
 * d'envoi ([pending], dont les octets donnent aussi les métadonnées de la prise).
 */
internal data class StoryLookBakeJob(
    val mediaId: String,
    val look: StoryMediaLook,
    val uploaded: UploadedMedia? = null,
    val pending: MediaUploadItem? = null,
)

/**
 * **LA CUISSON À LA PUBLICATION, ET SEULEMENT LÀ** (#13841, miroir de `StoryPublicationLookBake` iOS, #13840) : chaque
 * image dont le look peint repart en COPIE DÉRIVÉE, mise en file d'envoi comme un média ordinaire ; la charge qui part ne
 * nomme que la copie, et aucun look n'y voyage. Le brouillon, lui, garde l'original et ses réglages.
 */
internal object StoryPublicationLookBake {

    /** Les images à cuire, dans l'ordre des diapos ; un look qui ne peint rien, ou une vidéo, ne cuit pas. */
    fun jobs(state: StoryComposerUiState): List<StoryLookBakeJob> =
        state.deck.slides.flatMap { slide ->
            slide.mediaIds.mapNotNull { id ->
                val look = slide.mediaLooks[id]?.takeIf(StoryMediaLookMapping::paints) ?: return@mapNotNull null
                val uploaded = state.attachments.firstOrNull { it.id == id }
                val pending = state.pendingUploads.firstOrNull { it.cmid == id }?.item
                val mime = uploaded?.mimeType ?: pending?.mimeType ?: return@mapNotNull null
                if (mime.startsWith("video", ignoreCase = true)) null else StoryLookBakeJob(id, look, uploaded, pending)
            }
        }

    /**
     * La composition qui PART : chaque média cuit ([baked], par identifiant d'origine) remplacé par sa copie en attente
     * d'envoi — fond, média posé, description et légende suivent sa nouvelle adresse —, et plus aucun look.
     */
    fun applied(state: StoryComposerUiState, baked: Map<String, PendingMediaUpload>): StoryComposerUiState =
        renamed(state, baked.mapValues { it.value.cmid }).let { it.copy(pendingUploads = it.pendingUploads + baked.values) }

    /** Idem pour une story ÉDITÉE, en ligne seulement : la copie est déjà envoyée ([baked]) et compte parmi ses médias. */
    fun appliedUploaded(state: StoryComposerUiState, baked: Map<String, UploadedMedia>): StoryComposerUiState =
        renamed(state, baked.mapValues { it.value.id }).let { it.copy(attachments = it.attachments + baked.values) }

    private fun renamed(state: StoryComposerUiState, renamed: Map<String, String>): StoryComposerUiState {
        fun moved(id: String): String = renamed[id] ?: id
        val slides = state.deck.slides.map { slide ->
            slide.copy(
                mediaIds = slide.mediaIds.map(::moved),
                backgroundMediaId = slide.backgroundMediaId?.let(::moved),
                placedMedia = slide.placedMedia.map { it.copy(mediaId = moved(it.mediaId), id = if (it.id == it.mediaId) moved(it.id) else it.id) },
                mediaLooks = emptyMap(),
            )
        }
        return state.copy(
            deck = state.deck.copy(slides = slides),
            draft = state.draft.copy(
                mediaAlt = state.draft.mediaAlt.mapKeys { moved(it.key) },
                mediaCaption = state.draft.mediaCaption.mapKeys { moved(it.key) },
            ),
        )
    }
}
