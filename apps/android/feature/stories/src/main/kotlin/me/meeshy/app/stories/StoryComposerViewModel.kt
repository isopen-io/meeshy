package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryRepository
import javax.inject.Inject

/**
 * Immutable state of the story composer. [canPublish] is derived from the draft
 * and gated while a publish or media upload is in flight. [attachments] hold the
 * uploaded media for the on-screen preview; the draft carries only their ids for
 * the wire request.
 */
@Immutable
data class StoryComposerUiState(
    val draft: StoryComposerDraft = StoryComposerDraft(),
    val attachments: List<UploadedMedia> = emptyList(),
    val isUploadingMedia: Boolean = false,
    val isPublishing: Boolean = false,
    val errorMessage: String? = null,
) {
    val canPublish: Boolean get() = draft.canPublish && !isPublishing && !isUploadingMedia
}

/**
 * Drives the text story composer — parity with iOS `StoryComposerViewModel` +
 * `StoryPublishService`, surpassing it: where iOS posts via a dedicated story
 * queue, Android publishes through the **shared durable outbox**
 * ([StoryRepository.enqueuePublish]) on its own lane, so a publish survives
 * process death / offline and retries automatically without head-of-line
 * blocking messages. The publish is optimistic — the composer dismisses the
 * instant the row is queued (the `published` signal); the tray reconciles the
 * real story via its SWR revalidation / `story:created` socket.
 *
 * The publisher's content language is resolved once from the signed-in identity
 * via the single-source-of-truth [LanguageResolver] (Prisme), never re-derived.
 */
@HiltViewModel
class StoryComposerViewModel @Inject constructor(
    private val storyRepository: StoryRepository,
    private val sessionRepository: SessionRepository,
    private val mediaRepository: MediaRepository,
    private val workManager: WorkManager,
) : ViewModel() {

    private val _state = MutableStateFlow(StoryComposerUiState())
    val state: StateFlow<StoryComposerUiState> = _state.asStateFlow()

    /** One-shot signal that a story was queued — the screen dismisses on it. */
    private val _published = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val published: SharedFlow<Unit> = _published.asSharedFlow()

    fun onTextChange(text: String) {
        _state.update { it.copy(draft = it.draft.withText(text), errorMessage = null) }
    }

    fun onVisibilityChange(visibility: StoryVisibility) {
        _state.update { it.copy(draft = it.draft.withVisibility(visibility)) }
    }

    /**
     * Uploads freshly-picked media and attaches the returned ids to the draft.
     * Empty picks are inert; a second pick while an upload is in flight is ignored
     * (re-entrancy guard). The upload is synchronous in the VM for v1 — a durable
     * upload-then-publish outbox chain is the SOTA follow-up. On success the new
     * media is **appended** so multiple picks accumulate; an empty result (every
     * row unusable), a failure response, or a thrown error all surface a message
     * and leave the existing draft untouched.
     */
    fun onMediaPicked(items: List<MediaUploadItem>) {
        if (items.isEmpty() || _state.value.isUploadingMedia) return
        _state.update { it.copy(isUploadingMedia = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                when (val result = mediaRepository.upload(items)) {
                    is NetworkResult.Success -> applyUploaded(result.data)
                    is NetworkResult.Failure -> _state.update {
                        it.copy(isUploadingMedia = false, errorMessage = result.error.message)
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                _state.update { it.copy(isUploadingMedia = false, errorMessage = e.message ?: MEDIA_FAILED) }
            }
        }
    }

    private fun applyUploaded(uploaded: List<UploadedMedia>) {
        if (uploaded.isEmpty()) {
            _state.update { it.copy(isUploadingMedia = false, errorMessage = MEDIA_UNUSABLE) }
            return
        }
        _state.update {
            val attachments = it.attachments + uploaded
            it.copy(
                attachments = attachments,
                draft = it.draft.withMediaIds(attachments.map(UploadedMedia::id)),
                isUploadingMedia = false,
            )
        }
    }

    /** Removes an attached media (and its id from the draft) before publishing. */
    fun onRemoveMedia(id: String) {
        _state.update {
            val attachments = it.attachments.filterNot { media -> media.id == id }
            it.copy(
                attachments = attachments,
                draft = it.draft.withMediaIds(attachments.map(UploadedMedia::id)),
            )
        }
    }

    fun publish() {
        val current = _state.value
        if (!current.canPublish) return
        _state.update { it.copy(isPublishing = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                storyRepository.enqueuePublish(current.draft.toCreateStoryRequest(resolvePublishLanguage()))
                workManager.enqueue(OutboxFlushWorker.buildRequest())
                _state.update { StoryComposerUiState() }
                _published.tryEmit(Unit)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                _state.update { it.copy(isPublishing = false, errorMessage = e.message ?: "Publish failed") }
            }
        }
    }

    private fun resolvePublishLanguage(): String =
        sessionRepository.currentUser.value
            ?.let { LanguageResolver.resolveUserLanguage(it) }
            ?: LanguageResolver.FALLBACK_LANGUAGE

    private companion object {
        const val MEDIA_FAILED = "Couldn't attach that media"
        const val MEDIA_UNUSABLE = "That media couldn't be attached"
    }
}
