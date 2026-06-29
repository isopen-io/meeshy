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
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryRepository
import java.util.UUID
import javax.inject.Inject

/** Mints a fresh, collision-free slide id. The pure [StorySlideDeck] reducer stays
 * deterministic — id generation lives here, at the impure ViewModel edge. */
private fun newSlideId(): String = UUID.randomUUID().toString()

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
 * already-uploaded media for the on-screen preview; [pendingUploads] are the media
 * queued durably offline (their placeholder ids already in the draft) — several may
 * accumulate so a user can stage a whole offline batch. The draft carries every
 * media id (real + placeholder) for the wire request.
 */
@Immutable
data class StoryComposerUiState(
    val draft: StoryComposerDraft = StoryComposerDraft(),
    val deck: StorySlideDeck = StorySlideDeck.single(newSlideId()),
    val attachments: List<UploadedMedia> = emptyList(),
    val pendingUploads: List<PendingMediaUpload> = emptyList(),
    val isUploadingMedia: Boolean = false,
    val isPublishing: Boolean = false,
    val errorMessage: String? = null,
) {
    /**
     * Publishable when some slide carries text **or** media is attached, every slide
     * is within the character cap, the media cap holds, and nothing is in flight.
     * The whole **deck** gates publishing — not just the slide currently being
     * edited — so an over-long off-screen slide still blocks the action.
     */
    val canPublish: Boolean
        get() = (deck.hasText || draft.hasMedia) &&
            deck.isWithinTextLimit(StoryComposerDraft.MAX_CHARS) &&
            draft.isWithinMediaLimit &&
            !isPublishing &&
            !isUploadingMedia

    /** Every media id carried into the wire request: uploaded ids then the offline placeholders. */
    internal val draftMediaIds: List<String>
        get() = attachments.map(UploadedMedia::id) + pendingUploads.map(PendingMediaUpload::cmid)
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
        _state.update {
            val deck = it.deck.updateSelectedText(text)
            it.copy(draft = it.draft.withText(text), deck = deck, errorMessage = null)
        }
    }

    fun onVisibilityChange(visibility: StoryVisibility) {
        _state.update { it.copy(draft = it.draft.withVisibility(visibility)) }
    }

    /** Appends a fresh empty slide and selects it (inert at the ≤10-slide cap); the
     * editor follows the new selection, so it clears to the empty slide's text. */
    fun onAddSlide() = applyDeck { it.addSlide(newSlideId()) }

    /** Inserts a clone of the selected slide right after it and selects the clone. */
    fun onDuplicateSelectedSlide() = applyDeck { it.duplicate(it.selectedId, newSlideId()) }

    /** Removes the slide [id] (inert on the last remaining slide / unknown id). */
    fun onRemoveSlide(id: String) = applyDeck { it.removeSlide(id) }

    /** Reorders the slide [id] to [toIndex] (selection preserved by id). */
    fun onMoveSlide(id: String, toIndex: Int) = applyDeck { it.move(id, toIndex) }

    /** Switches the active slide to [id] (inert on unknown id). */
    fun onSelectSlide(id: String) = applyDeck { it.select(id) }

    /**
     * Applies a structural deck transform and re-syncs the editor buffer to the
     * (possibly new) selected slide's text, keeping `draft.text == selected slide`
     * the single invariant the screen relies on.
     */
    private inline fun applyDeck(transform: (StorySlideDeck) -> StorySlideDeck) {
        _state.update {
            val deck = transform(it.deck)
            it.copy(deck = deck, draft = it.draft.withText(deck.selectedSlide.text))
        }
    }

    /**
     * Uploads freshly-picked media and attaches the returned ids to the draft.
     * Empty picks are inert; a second pick while an upload is in flight is ignored
     * (re-entrancy guard). On success the new media is **appended** so multiple
     * picks accumulate; an empty result (every row unusable) surfaces a message.
     *
     * When the synchronous upload **fails transiently** (offline / throttled / 5xx),
     * every accepted item is instead queued **durably** ([queueDurably]) and staged
     * as a [PendingMediaUpload] placeholder, so the user can still publish — the
     * outbox uploads each and grafts the real ids when the network returns. Several
     * pending uploads accumulate across picks (and a multi-item offline batch stages
     * each item), surpassing iOS, which drops the pick on an offline upload. A
     * permanent failure (4xx) surfaces the error and stages nothing.
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
     * A transient failure → durably queue every accepted item (single pick or batch);
     * a permanent error (4xx) surfaces the message and stages nothing.
     */
    private suspend fun onUploadFailed(accepted: List<MediaUploadItem>, error: ApiError) {
        if (MediaUploadRetryPolicy.isQueueable(error)) {
            queueDurably(accepted)
        } else {
            _state.update { it.copy(isUploadingMedia = false, errorMessage = error.message) }
        }
    }

    /**
     * Enqueues each item durably and stages it as a pending upload, one at a time so
     * partial progress survives if a later enqueue throws (the already-staged items
     * stay, the caller's catch surfaces the error). Each enqueued blob + outbox row
     * shares the returned cmid, which rides in the draft as a placeholder media id.
     */
    private suspend fun queueDurably(items: List<MediaUploadItem>) {
        items.forEach { item ->
            val cmid = mediaUploadQueue.enqueue(item)
            _state.update {
                val next = it.copy(pendingUploads = it.pendingUploads + PendingMediaUpload(cmid = cmid, item = item))
                next.copy(draft = next.draft.withMediaIds(next.draftMediaIds), errorMessage = null)
            }
        }
        _state.update { it.copy(isUploadingMedia = false) }
    }

    /**
     * Removes an attached or pending media (and its id from the draft) before
     * publishing. Removing an offline placeholder also **cancels** only that durable
     * upload ([MediaUploadQueue.cancel]) — the other pending uploads are untouched —
     * so no orphaned `UPLOAD_MEDIA` row keeps uploading bytes to a media the story
     * will never reference. The UI clears instantly (optimistic); the durable cancel
     * is best-effort — if it fails the stranded row simply exhausts harmlessly.
     */
    fun onRemoveMedia(id: String) {
        val wasPending = _state.value.pendingUploads.any { it.cmid == id }
        _state.update {
            val next = if (wasPending) {
                it.copy(pendingUploads = it.pendingUploads.filterNot { pending -> pending.cmid == id })
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
                val requests = publishRequests(current, resolvePublishLanguage())
                val prerequisites = current.pendingUploads.map(PendingMediaUpload::cmid)
                requests.forEachIndexed { index, request ->
                    storyRepository.enqueuePublish(
                        request,
                        dependsOn = if (index == 0) prerequisites else emptyList(),
                    )
                }
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

    /**
     * Maps the deck to the wire requests, lossless across all slides until per-slide
     * effect serialization lands: **one story per non-blank slide**, in deck order.
     * The first story carries the whole-story media + offline prerequisites (the
     * later text-only slides carry neither). A media-only deck (no slide has text)
     * still emits a single media-bearing story.
     */
    private fun publishRequests(current: StoryComposerUiState, language: String): List<CreateStoryRequest> {
        val texts = current.deck.publishableSlides.map(StorySlide::text)
        if (texts.isEmpty()) {
            return listOf(current.draft.withText("").toCreateStoryRequest(language))
        }
        return texts.mapIndexed { index, text ->
            val draft = if (index == 0) {
                current.draft.withText(text)
            } else {
                StoryComposerDraft(text = text, visibility = current.draft.visibility)
            }
            draft.toCreateStoryRequest(language)
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
