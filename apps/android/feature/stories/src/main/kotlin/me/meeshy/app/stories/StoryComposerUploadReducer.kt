package me.meeshy.app.stories

import me.meeshy.sdk.media.MediaLocationRefusal
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerMediaPlacement
import me.meeshy.sdk.model.composer.ComposerMediaRole
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.net.ApiError

/**
 * The media-upload slice of the story composer's state (#13429): one line per media of the pick, each
 * with its own bytes in flight, from « waiting its turn » to attached. Pure — the view model only routes.
 */
internal object StoryComposerUploadReducer {

    /**
     * Where each of [count] picked media lands (R4 de #13863, [ComposerMediaPlacement]): the first of a slide without a
     * background becomes it, the next is posed ON the scene, a series founds one slide per media. Shorter than [count]
     * at the slide cap: what finds no slide is refused, never slipped onto the last one.
     */
    fun landings(state: StoryComposerUiState, count: Int, asBackground: Boolean = false): List<ComposerMediaPlacement.Landing> =
        ComposerMediaPlacement.plan(
            count = count,
            slideHasBackground = state.selectedSlideBackdropMediaId != null,
            freeSlides = if (state.canAddSlide) StorySlideDeck.MAX_SLIDES - state.deck.size else 0,
            asBackground = asBackground,
        )

    fun started(state: StoryComposerUiState, count: Int, asBackground: Boolean = false): StoryComposerUiState =
        started(state, landings(state, count, asBackground))

    /**
     * The pick is under way: one line per media, each knowing where it will land; [refused] media found no slide, and it is
     * said. [items] are the media in flight, whose preview and weight the placeholder on the scene shows (R5 de #13863).
     */
    fun started(
        state: StoryComposerUiState,
        landings: List<ComposerMediaPlacement.Landing>,
        refused: Int = 0,
        items: List<MediaUploadItem> = emptyList(),
    ): StoryComposerUiState =
        state.copy(
            isUploadingMedia = true,
            errorMessage = SLIDES_FULL.takeIf { refused > 0 },
            uploadingMedia = List(landings.size) { MediaUploadProgress.Idle },
            mediaLandings = landings,
            incomingMedia = items,
            canRetryMedia = false,
        )

    fun progressed(state: StoryComposerUiState, index: Int, sent: Long, total: Long): StoryComposerUiState {
        if (index !in state.uploadingMedia.indices) return state
        return state.copy(
            uploadingMedia = state.uploadingMedia.mapIndexed { i, line ->
                if (i == index) MediaUploadProgress.Uploading(sent, total) else line
            },
        )
    }

    /**
     * The uploaded media take the places decided at the pick; nothing usable comes back as a said error, never silence.
     * [asBackground] (« ⋯ › Choisir un fond », #13845) : the first becomes the slide's designated background.
     */
    fun uploaded(state: StoryComposerUiState, uploaded: List<UploadedMedia>, asBackground: Boolean = false): StoryComposerUiState {
        if (uploaded.isEmpty()) return settled(state).copy(errorMessage = StoryComposerViewModel.MEDIA_UNUSABLE)
        val landings = state.mediaLandings.takeIf { it.size >= uploaded.size } ?: landings(state, uploaded.size, asBackground)
        val withMedia = state.copy(attachments = state.attachments + uploaded)
        val landed = uploaded.withIndex().fold(withMedia) { acc, (index, media) ->
            acc.landing(media.id, landings.getOrNull(index), asBackground && index == 0)
        }
        return settled(landed).mirrorDraftToSelection()
    }

    /**
     * One media of the pick, RECEIVED (#13959): it takes the place decided for it at the pick ([index]), whatever became of
     * its siblings — a video the gateway holds is never thrown back into the queue because the photo picked with it failed.
     */
    fun landedAt(state: StoryComposerUiState, media: UploadedMedia, asBackground: Boolean = false, index: Int? = 0): StoryComposerUiState {
        val landing = index?.let(state.mediaLandings::getOrNull) ?: landings(state, 1, asBackground).firstOrNull()
        return state.copy(attachments = state.attachments + media).landing(media.id, landing, asBackground && index == 0).mirrorDraftToSelection()
    }

    /**
     * A media kept on the device for the outbox to send: a placeholder id rides in the slide until then, at the place the
     * pick decided for it ([index] in the pick) — a background, posed on the scene, or the root of its own slide.
     */
    fun queued(
        state: StoryComposerUiState,
        cmid: String,
        item: MediaUploadItem,
        asBackground: Boolean = false,
        index: Int = 0,
    ): StoryComposerUiState {
        val landing = state.mediaLandings.getOrNull(index) ?: landings(state, 1, asBackground).firstOrNull()
        val kept = state.copy(pendingUploads = state.pendingUploads + PendingMediaUpload(cmid = cmid, item = item))
        return kept.landing(cmid, landing, asBackground && index == 0).mirrorDraftToSelection()
    }

    /** [id] joins the scene where [landing] says: its own new slide, the current slide's background, or posed on it and selected. */
    private fun StoryComposerUiState.landing(id: String, landing: ComposerMediaPlacement.Landing?, designates: Boolean): StoryComposerUiState {
        val onSlide = if (landing?.newSlide == true) withDeckTransform { it.addSlide(newSlideId()) } else this
        val attached = onSlide.copy(deck = onSlide.deck.addMediaToSelected(id).designatingBackground(id.takeIf { designates }))
        if (landing?.role != ComposerMediaRole.FOREGROUND) return attached
        return StoryComposerSelectionReducer.mediaSelected(StoryComposerPlacedMediaReducer.placed(attached, id), id)
    }

    private fun StorySlideDeck.designatingBackground(mediaId: String?): StorySlideDeck =
        if (mediaId == null || isSelectedBackgroundMedia(mediaId)) this else toggleSelectedBackgroundMedia(mediaId)

    fun settled(state: StoryComposerUiState): StoryComposerUiState =
        state.copy(isUploadingMedia = false, uploadingMedia = emptyList(), mediaLandings = emptyList(), incomingMedia = emptyList())

    /**
     * A pick whose location cannot be removed (#13550) is NOT kept behind a placeholder: the same bytes would be refused on
     * every retry. The pick is dropped and [LOCATION_REFUSED] tells the author to choose another file.
     */
    fun locationRefused(state: StoryComposerUiState): StoryComposerUiState = settled(state).copy(errorMessage = LOCATION_REFUSED)

    /** The upload failed because a media's location cannot be removed ([MediaLocationRefusal]), not for a reason a retry could fix. */
    fun refusesForLocation(error: ApiError): Boolean = MediaLocationRefusal.isCode(error.code)

    /** The [StoryComposerUiState.errorMessage] key the screen renders as its localized refusal. */
    const val LOCATION_REFUSED: String = "media-location-not-removable"

    /** A series that met the slide cap: what found no slide was not taken, and the screen says why. */
    const val SLIDES_FULL: String = "media-slides-full"
}
