package me.meeshy.app.stories

import me.meeshy.sdk.media.MediaLocationRefusal
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.net.ApiError

/**
 * The media-upload slice of the story composer's state (#13429): one line per media of the pick, each
 * with its own bytes in flight, from « waiting its turn » to attached. Pure — the view model only routes.
 */
internal object StoryComposerUploadReducer {

    fun started(state: StoryComposerUiState, count: Int): StoryComposerUiState =
        state.copy(isUploadingMedia = true, errorMessage = null, uploadingMedia = List(count) { MediaUploadProgress.Idle })

    fun progressed(state: StoryComposerUiState, index: Int, sent: Long, total: Long): StoryComposerUiState {
        if (index !in state.uploadingMedia.indices) return state
        return state.copy(
            uploadingMedia = state.uploadingMedia.mapIndexed { i, line ->
                if (i == index) MediaUploadProgress.Uploading(sent, total) else line
            },
        )
    }

    /** The uploaded media join the selected slide; nothing usable comes back as a said error, never silence. */
    fun uploaded(state: StoryComposerUiState, uploaded: List<UploadedMedia>): StoryComposerUiState {
        if (uploaded.isEmpty()) return settled(state).copy(errorMessage = StoryComposerViewModel.MEDIA_UNUSABLE)
        val deck = uploaded.fold(state.deck) { acc, media -> acc.addMediaToSelected(media.id) }
        return settled(state).copy(deck = deck, attachments = state.attachments + uploaded).mirrorDraftToSelection()
    }

    /** A media kept on the device for the outbox to send: a placeholder id rides in the slide until then. */
    fun queued(state: StoryComposerUiState, cmid: String, item: MediaUploadItem): StoryComposerUiState =
        state.copy(
            deck = state.deck.addMediaToSelected(cmid),
            pendingUploads = state.pendingUploads + PendingMediaUpload(cmid = cmid, item = item),
            errorMessage = null,
        ).mirrorDraftToSelection()

    fun settled(state: StoryComposerUiState): StoryComposerUiState =
        state.copy(isUploadingMedia = false, uploadingMedia = emptyList())

    /**
     * A pick whose location cannot be removed (#13550) is NOT kept behind a placeholder: the same bytes would be refused on
     * every retry. The pick is dropped and [LOCATION_REFUSED] tells the author to choose another file.
     */
    fun locationRefused(state: StoryComposerUiState): StoryComposerUiState = settled(state).copy(errorMessage = LOCATION_REFUSED)

    /** The upload failed because a media's location cannot be removed ([MediaLocationRefusal]), not for a reason a retry could fix. */
    fun refusesForLocation(error: ApiError): Boolean = MediaLocationRefusal.isCode(error.code)

    /** The [StoryComposerUiState.errorMessage] key the screen renders as its localized refusal. */
    const val LOCATION_REFUSED: String = "media-location-not-removable"
}
