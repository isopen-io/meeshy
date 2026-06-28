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
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryRepository
import javax.inject.Inject

/**
 * A media attachment durably queued offline: its bytes live in `MediaBlobStore`
 * and an `UPLOAD_MEDIA` outbox row is enqueued, both keyed by [cmid]. The publish
 * carries [cmid] as a placeholder media id and `dependsOn` it, so the drainer
 * grafts the real id once the upload delivers. [item] is retained only to render
 * the local preview while it waits.
 */
@Immutable
data class PendingMediaUpload(
    val cmid: String,
    val item: MediaUploadItem,
)

/**
 * Immutable state of the story composer. [canPublish] is derived from the draft
 * and gated while a publish or media upload is in flight. [attachments] hold the
 * already-uploaded media for the on-screen preview; [pendingUpload] is a single
 * media queued durably offline (placeholder id already in the draft). The draft
 * carries every media id (real + placeholder) for the wire request.
 */
@Immutable
data class StoryComposerUiState(
    val draft: StoryComposerDraft = StoryComposerDraft(),
    val attachments: List<UploadedMedia> = emptyList(),
    val pendingUpload: PendingMediaUpload? = null,
    val isUploadingMedia: Boolean = false,
    val isPublishing: Boolean = false,
    val errorMessage: String? = null,
) {
    val canPublish: Boolean get() = draft.canPublish && !isPublishing && !isUploadingMedia

    /** Every media id carried into the wire request: uploaded ids then the offline placeholder. */
    internal val draftMediaIds: List<String>
        get() = attachments.map(UploadedMedia::id) + listOfNotNull(pendingUpload?.cmid)
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
    private val mediaUploadQueue: MediaUploadQueue,
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
     * (re-entrancy guard). On success the new media is **appended** so multiple
     * picks accumulate; an empty result (every row unusable) surfaces a message.
     *
     * When the synchronous upload **fails transiently** (offline / throttled / 5xx)
     * for a **single** pick and nothing is already pending, the media is instead
     * queued **durably** ([queueDurably]) and staged as a [PendingMediaUpload]
     * placeholder, so the user can still publish — the outbox uploads and grafts
     * the real id when the network returns. This surpasses iOS, which drops the
     * pick on an offline upload. A permanent failure (4xx), a multi-item pick, or a
     * pick while one upload is already pending surfaces the error instead.
     */
    fun onMediaPicked(items: List<MediaUploadItem>) {
        if (items.isEmpty() || _state.value.isUploadingMedia) return
        val remaining = _state.value.draft.remainingMediaSlots
        if (remaining <= 0) {
            _state.update { it.copy(errorMessage = MEDIA_LIMIT) }
            return
        }
        val accepted = items.take(remaining)
        _state.update { it.copy(isUploadingMedia = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                when (val result = mediaRepository.upload(accepted)) {
                    is NetworkResult.Success -> applyUploaded(result.data)
                    is NetworkResult.Failure -> onUploadFailed(accepted, result.error)
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
            val next = it.copy(attachments = it.attachments + uploaded, isUploadingMedia = false)
            next.copy(draft = next.draft.withMediaIds(next.draftMediaIds))
        }
    }

    /**
     * A single transient failure with no upload already pending → queue it durably;
     * anything else (permanent error, multi-item batch, or a slot already taken by a
     * pending upload) surfaces the error and stages nothing.
     */
    private suspend fun onUploadFailed(accepted: List<MediaUploadItem>, error: ApiError) {
        val single = accepted.singleOrNull()
        if (single != null && _state.value.pendingUpload == null && MediaUploadRetryPolicy.isQueueable(error)) {
            queueDurably(single)
        } else {
            _state.update { it.copy(isUploadingMedia = false, errorMessage = error.message) }
        }
    }

    private suspend fun queueDurably(item: MediaUploadItem) {
        val cmid = mediaUploadQueue.enqueue(item)
        _state.update {
            val next = it.copy(pendingUpload = PendingMediaUpload(cmid = cmid, item = item), isUploadingMedia = false)
            next.copy(draft = next.draft.withMediaIds(next.draftMediaIds), errorMessage = null)
        }
    }

    /**
     * Removes an attached or pending media (and its id from the draft) before
     * publishing. Removing the offline placeholder also **cancels** its durable
     * upload ([MediaUploadQueue.cancel]) so no orphaned `UPLOAD_MEDIA` row keeps
     * uploading bytes to a media the story will never reference. The UI clears
     * instantly (optimistic); the durable cancel is best-effort — if it fails the
     * stranded row simply exhausts harmlessly on its own.
     */
    fun onRemoveMedia(id: String) {
        val wasPending = _state.value.pendingUpload?.cmid == id
        _state.update {
            val next = if (id == it.pendingUpload?.cmid) {
                it.copy(pendingUpload = null)
            } else {
                it.copy(attachments = it.attachments.filterNot { media -> media.id == id })
            }
            next.copy(draft = next.draft.withMediaIds(next.draftMediaIds))
        }
        if (wasPending) cancelDurableUpload(id)
    }

    private fun cancelDurableUpload(cmid: String) {
        viewModelScope.launch {
            try {
                mediaUploadQueue.cancel(cmid)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                // Best-effort: a stranded UPLOAD_MEDIA row exhausts harmlessly on its own.
            }
        }
    }

    fun publish() {
        val current = _state.value
        if (!current.canPublish) return
        _state.update { it.copy(isPublishing = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                storyRepository.enqueuePublish(
                    current.draft.toCreateStoryRequest(resolvePublishLanguage()),
                    dependsOn = listOfNotNull(current.pendingUpload?.cmid),
                )
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
        const val MEDIA_LIMIT = "You can attach up to ${StoryComposerDraft.MAX_MEDIA} items"
    }
}
