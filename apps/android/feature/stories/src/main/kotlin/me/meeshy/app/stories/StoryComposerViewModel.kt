package me.meeshy.app.stories

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
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerBandState
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.model.scene.StoryBackgroundFraming
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryComposerDraftStore
import me.meeshy.sdk.story.StoryRepository
import java.time.Instant
import javax.inject.Inject

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
    private val mediaUploader: StoryMediaUploader,
    private val mediaUploadQueue: MediaUploadQueue,
    private val workManager: WorkManager,
    private val draftStore: StoryComposerDraftStore,
    private val mediaBlobStore: MediaBlobStore,
) : ViewModel() {

    private val _state = MutableStateFlow(StoryComposerUiState())
    val state: StateFlow<StoryComposerUiState> = _state.asStateFlow()

    /** The author colour the reader paints a background-less slide with (#12314). */
    val authorAccentHex: String get() = StorySceneFill.authorAccentHex(sessionRepository.currentUser.value)

    /** One-shot signal that a story was queued — the screen dismisses on it. */
    private val _published = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val published: SharedFlow<Unit> = _published.asSharedFlow()

    /**
     * Restores a persisted composer draft when the screen opens — iOS `onAppear` +
     * `StoryDraftStore.load`. Cache-first: the load is silent and only seeds the deck
     * while the composer is still **pristine** (a single blank slide), so it never
     * clobbers work the user has already begun in the async gap, and a corrupt/empty
     * stored blob is inert. The audience and repost link are re-armed alongside the
     * slides; the draft mirror is re-pointed at the restored selection.
     */
    fun onEnterComposer() {
        viewModelScope.launch {
            val stored = draftStore.load()
            val restored = StoryComposerAutosave.restore(
                stored = stored,
                deckIsPristine = StoryComposerAutosave.deckIsPristine(_state.value.deck),
            ) ?: return@launch
            val availableIds = restored.slides
                .flatMap { it.mediaIds }
                .toSet()
                .filter { id -> isRestoredMediaAvailable(id) }
                .toSet()
            val reconciled = StoryDraftMediaReconciler.reconcile(restored) { id -> id in availableIds }
            // Media loss can empty the whole draft; a snapshot no longer worth
            // restoring must not seed a deck of blank slides — purge it instead so a
            // later cold start never rebuilds the dead draft.
            if (!reconciled.snapshot.isWorthRestoring) {
                draftStore.clear()
                return@launch
            }
            val deck = reconciled.snapshot.toDeck() ?: return@launch
            _state.update {
                it.copy(
                    deck = deck,
                    draft = it.draft
                        .withVisibility(StoryVisibility.fromWire(reconciled.snapshot.visibility))
                        .withRepostOf(reconciled.snapshot.repostOfId),
                    errorMessage = if (reconciled.hasLoss) MEDIA_RESTORE_LOST else it.errorMessage,
                ).mirrorDraftToSelection()
            }
        }
    }

    /**
     * Whether a restored draft's media [id] can still be shown/published. An offline
     * upload placeholder ([OutboxIds.isCmid]) resolves against the durable blob store —
     * gone once its bytes were swept or its chain abandoned. A server-assigned id lives
     * server-side and is treated as available (its thumbnail rehydrates on demand). The
     * cheap [MediaBlobStore.has] never loads the bytes, so probing a whole draft's media
     * costs a boolean per id.
     */
    private suspend fun isRestoredMediaAvailable(id: String): Boolean =
        !OutboxIds.isCmid(id) || mediaBlobStore.has(id)

    /**
     * Persists (or purges) the current composer draft — iOS's save-on-dismiss. Called
     * when the screen leaves. The pure [StoryComposerAutosave] decides: a restorable
     * simple draft is saved, an emptied or no-longer-persistable draft purges any stored
     * one, and an unchanged draft writes nothing. Sticker elements are not yet persistable,
     * so a draft carrying one purges rather than restores lossily.
     */
    fun persistDraft() {
        viewModelScope.launch {
            val current = _state.value
            val action = StoryComposerAutosave.resolve(
                deck = current.deck,
                visibility = current.draft.visibility,
                repostOfId = current.draft.repostOfId,
                nowIso = Instant.now().toString(),
                previous = draftStore.load(),
            )
            when (action) {
                is StoryDraftPersist.Save -> draftStore.save(action.snapshot)
                StoryDraftPersist.Clear -> draftStore.clear()
                StoryDraftPersist.None -> Unit
            }
        }
    }

    /** Routes the text field to the selected element, else the slide caption. */
    fun onTextChange(text: String) = reduce { StoryComposerTextReducer.typed(it, text) }

    /** Adds an empty on-canvas text element and selects it (warns at the ≤5-element cap). */
    fun onAddTextElement() {
        val id = newTextElementId()
        reduce { StoryComposerTextReducer.added(it, id) }
    }

    fun onSelectTextElement(id: String) = reduce { StoryComposerTextReducer.selected(it, id) }

    fun onDeselectTextElement() = reduce { StoryComposerTextReducer.deselected(it) }

    fun onOpenElementMenu(id: String) = reduce { StoryComposerTextReducer.menuOpened(it, id) }

    fun onDismissElementMenu() = reduce { StoryComposerTextReducer.menuDismissed(it) }

    /**
     * Dispatches a chosen context-menu [action] to the existing per-element intent and then
     * dismisses the menu. A disabled action or a stale menu is a safe no-op on the deck.
     */
    fun onElementMenuAction(action: StoryElementAction) {
        val menu = _state.value.elementContextMenu
        if (menu != null && menu.isEnabled(action)) {
            val id = menu.elementId
            when (action) {
                StoryElementAction.EDIT -> onSelectTextElement(id)
                StoryElementAction.DUPLICATE -> onDuplicateTextElement(id)
                StoryElementAction.DELETE -> onRemoveTextElement(id)
                StoryElementAction.SEND_TO_BACK,
                StoryElementAction.MOVE_BACKWARD,
                StoryElementAction.MOVE_FORWARD,
                StoryElementAction.BRING_TO_FRONT,
                -> action.zOrder?.let { onReorderTextElement(id, it) }
            }
        }
        onDismissElementMenu()
    }

    /** Drags element [id] by normalised deltas with magnetic snapping. */
    fun onTextElementMoved(id: String, dx: Float, dy: Float) = reduce { StoryComposerTextReducer.moved(it, id, dx, dy) }

    fun onTextElementDragEnd() = reduce { StoryComposerTextReducer.dragEnded(it) }

    fun onRemoveTextElement(id: String) = reduce { StoryComposerTextReducer.removed(it, id) }

    fun onTextElementStyle(id: String, style: StoryTextStyle) = reduce { StoryComposerTextReducer.styled(it, id, style) }

    fun onTextElementColor(id: String, color: String) = reduce { StoryComposerTextReducer.colored(it, id, color) }

    fun onTextElementAlign(id: String, align: StoryTextAlign) = reduce { StoryComposerTextReducer.aligned(it, id, align) }

    fun onTextElementBackground(id: String, background: StoryTextBackground) =
        reduce { StoryComposerTextReducer.backed(it, id, background) }

    fun onTextElementCycleSize(id: String) = reduce { StoryComposerTextReducer.sizeCycled(it, id) }

    fun onTextElementCycleOutline(id: String) = reduce { StoryComposerTextReducer.outlineCycled(it, id) }

    fun onTextElementCycleFadeIn(id: String) = reduce { StoryComposerTextReducer.fadeInCycled(it, id) }

    fun onTextElementCycleFadeOut(id: String) = reduce { StoryComposerTextReducer.fadeOutCycled(it, id) }

    fun onTextElementCycleStart(id: String) = reduce { StoryComposerTextReducer.startCycled(it, id) }

    fun onTextElementCycleDuration(id: String) = reduce { StoryComposerTextReducer.durationCycled(it, id) }

    fun onTextElementTransform(id: String, scaleBy: Float, rotateByDeg: Float) =
        reduce { StoryComposerTextReducer.transformed(it, id, scaleBy, rotateByDeg) }

    fun onReorderTextElement(id: String, op: StoryZOrder) = reduce { StoryComposerTextReducer.reordered(it, id, op) }

    fun onDuplicateTextElement(id: String) {
        val newId = newTextElementId()
        reduce { StoryComposerTextReducer.duplicated(it, id, newId) }
    }

    /** Adds an emoji sticker to the selected slide and selects it (blank ignored, warns at the cap). */
    fun onAddSticker(emoji: String) {
        val id = newStickerId()
        reduce { StoryComposerStickerReducer.added(it, emoji, id) }
    }

    fun onSelectSticker(id: String) = reduce { StoryComposerStickerReducer.selected(it, id) }

    fun onDeselectSticker() = reduce { StoryComposerStickerReducer.deselected(it) }

    fun onRemoveSticker(id: String) = reduce { StoryComposerStickerReducer.removed(it, id) }

    fun onStickerMoved(id: String, dx: Float, dy: Float) = reduce { StoryComposerStickerReducer.moved(it, id, dx, dy) }

    fun onStickerTransform(id: String, scaleBy: Float, rotateByDeg: Float) =
        reduce { StoryComposerStickerReducer.transformed(it, id, scaleBy, rotateByDeg) }

    /** Enters the drawing tool (closes the band, clears selections). */
    fun onEnterDrawingMode() = reduce { StoryComposerDrawingReducer.entered(it) }

    fun onExitDrawingMode() = reduce { StoryComposerDrawingReducer.exited(it) }

    fun onDrawColorSelected(colorHex: String) = reduce { StoryComposerDrawingReducer.colorSelected(it, colorHex) }

    fun onDrawWidthSelected(widthDesign: Double) = reduce { StoryComposerDrawingReducer.widthSelected(it, widthDesign) }

    /** Commits a captured freehand stroke (design-space [points]); a tap is dropped. */
    fun onStrokeCaptured(points: List<StoryDrawingStrokePoint>) {
        val id = newStrokeId()
        val now = Instant.now().epochSecond.toDouble()
        reduce { StoryComposerDrawingReducer.captured(it, points, id, now) }
    }

    fun onDrawUndo() = reduce { StoryComposerDrawingReducer.undone(it) }

    fun onVisibilityChange(visibility: StoryVisibility) {
        _state.update { it.copy(draft = it.draft.withVisibility(visibility)) }
    }

    /**
     * Opens the composer as a **repost** of [sourceId]: the link rides onto every published
     * slide's wire request. Inert on a blank id; the author's own draft is untouched.
     */
    fun onRepostSource(sourceId: String) {
        if (sourceId.isBlank()) return
        _state.update { it.copy(draft = it.draft.withRepostOf(sourceId)) }
    }

    /** Tap on a tool of the row: opens, switches to or closes its panel per [ComposerBandState.tapTool]. */
    fun onBandToolTap(tool: StoryToolMode) {
        _state.update { it.copy(band = it.band.tapTool(tool)) }
    }

    /** Swipe up on a tool: forces its panel open. */
    fun onBandToolSwipeUp(tool: StoryToolMode) {
        _state.update { it.copy(band = it.band.swipeUpOnTool(tool)) }
    }

    /** Swipe down on the row: closes an open panel, otherwise hides the chrome (bare canvas). */
    fun onBandSwipeDown() {
        _state.update { it.copy(band = if (it.band.isPanelOpen) it.band.closeAnyPanel() else it.band.hideChrome()) }
    }

    /** Gives the chrome back after a voluntary hiding (ghost handle tap). */
    fun onBandShowChrome() {
        _state.update { it.copy(band = it.band.showChrome()) }
    }

    /** Closes the open panel (handle pulled under its minimum) and gives the row back. */
    fun onBandDismiss() {
        _state.update { it.copy(band = it.band.closeAnyPanel()) }
    }

    /** Appends a fresh empty slide and selects it (inert at the ≤10-slide cap). */
    fun onAddSlide() = applyDeck { it.addSlide(newSlideId()) }

    /** Inserts a clone of the selected slide right after it and selects the clone. */
    fun onDuplicateSelectedSlide() = applyDeck { it.duplicate(it.selectedId, newSlideId()) }

    /**
     * Removes the slide [id] (inert on the last remaining slide / unknown id) and reclaims
     * its media: dropped from the preview pools, and each offline-pending upload among them
     * is cancelled so a discarded slide never leaves an orphaned `UPLOAD_MEDIA` row.
     */
    fun onRemoveSlide(id: String) {
        val before = _state.value.deck
        val removed = before.slides.firstOrNull { it.id == id } ?: return
        val after = before.removeSlide(id)
        if (after === before) return
        val droppedMedia = removed.mediaIds.toSet()
        val pendingToCancel = _state.value.pendingUploads
            .filter { it.cmid in droppedMedia }
            .map(PendingMediaUpload::cmid)
        _state.update {
            it.copy(
                deck = after,
                attachments = it.attachments.filterNot { media -> media.id in droppedMedia },
                pendingUploads = it.pendingUploads.filterNot { pending -> pending.cmid in droppedMedia },
            ).mirrorDraftToSelection()
        }
        pendingToCancel.forEach { cancelDurableUpload(it) }
    }

    fun onMoveSlide(id: String, toIndex: Int) = applyDeck { it.move(id, toIndex) }

    fun onSelectSlide(id: String) = applyDeck { it.select(id) }

    /**
     * Applies one pinch-zoom + drag-pan gesture to the selected slide's persisted
     * [StoryCanvasTransform]. The canvas size that produced the offset is captured here: it
     * is exactly the size needed to normalise the offset back at publish.
     */
    fun onCanvasTransform(panX: Float, panY: Float, zoom: Float, canvasWidth: Float, canvasHeight: Float) {
        _state.update {
            it.copy(
                deck = it.deck.updateSelectedTransform(
                    it.deck.selectedSlide.transform.apply(panX, panY, zoom, canvasWidth, canvasHeight),
                ),
                canvasWidthPx = canvasWidth,
                canvasHeightPx = canvasHeight,
            ).mirrorDraftToSelection()
        }
    }

    /** Sets (or clears) the selected slide's photo filter. */
    fun onSelectFilter(filter: StoryFilter?) = reduce { StoryComposerBackgroundReducer.filterSelected(it, filter) }

    fun onFilterIntensityChange(intensity: Float) =
        reduce { StoryComposerBackgroundReducer.filterIntensityChanged(it, intensity) }

    /** Pins the selected slide's on-screen duration (bounded by the pure deck law). */
    fun onSlideDurationChange(seconds: Double) = reduce { StoryComposerBackgroundReducer.durationChanged(it, seconds) }

    /** Sets (or clears) the selected slide's backdrop colour. */
    fun onSlideBackgroundChange(background: me.meeshy.sdk.model.StoryBackgroundValue?) =
        reduce { StoryComposerBackgroundReducer.backgroundChanged(it, background) }

    /** Designates (or clears) the selected slide's single looping background media. */
    fun onToggleSlideBackgroundMedia(mediaId: String) =
        reduce { StoryComposerBackgroundReducer.backgroundMediaToggled(it, mediaId) }

    /** Sets whether the selected slide's designated video background loops. */
    fun onSetSlideBackgroundLoop(loop: Boolean) =
        reduce { StoryComposerBackgroundReducer.backgroundLoopSet(it, loop) }

    private fun reduce(next: (StoryComposerUiState) -> StoryComposerUiState) {
        _state.update(next)
    }

    /** Applies a structural deck transform, re-syncing the editor buffer to the selected slide. */
    private fun applyDeck(transform: (StorySlideDeck) -> StorySlideDeck) {
        _state.update { it.withDeckTransform(transform) }
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
        val remaining = _state.value.deck.selectedRemainingMediaSlots
        if (remaining <= 0) {
            _state.update { it.copy(errorMessage = MEDIA_LIMIT) }
            return
        }
        val accepted = items.take(remaining)
        _state.update { it.copy(isUploadingMedia = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                when (val result = mediaUploader.upload(accepted)) {
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
            val deck = uploaded.fold(it.deck) { acc, media -> acc.addMediaToSelected(media.id) }
            it.copy(deck = deck, attachments = it.attachments + uploaded, isUploadingMedia = false)
                .mirrorDraftToSelection()
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
            val cmid = mediaUploadQueue.enqueue(item, context = TusUploadContext.STORY)
            _state.update {
                it.copy(
                    deck = it.deck.addMediaToSelected(cmid),
                    pendingUploads = it.pendingUploads + PendingMediaUpload(cmid = cmid, item = item),
                    errorMessage = null,
                ).mirrorDraftToSelection()
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
            val deck = it.deck.removeMedia(id)
            val next = if (wasPending) {
                it.copy(deck = deck, pendingUploads = it.pendingUploads.filterNot { pending -> pending.cmid == id })
            } else {
                it.copy(deck = deck, attachments = it.attachments.filterNot { media -> media.id == id })
            }
            next.mirrorDraftToSelection()
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
                publishPlans(current, resolvePublishLanguage()).forEach { plan ->
                    storyRepository.enqueuePublish(plan.request, dependsOn = plan.dependsOn)
                }
                workManager.enqueue(OutboxFlushWorker.buildRequest())
                draftStore.clear()
                _state.update { StoryComposerUiState() }
                _published.tryEmit(Unit)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                _state.update { it.copy(isPublishing = false, errorMessage = e.message ?: "Publish failed") }
            }
        }
    }

    /** One publishable slide's wire request paired with the offline uploads it must wait on. */
    private data class PublishPlan(val request: CreateStoryRequest, val dependsOn: List<String>)

    /**
     * Maps the deck to one wire request **per publishable slide** (non-blank text or
     * attached media), in deck order. Each story carries **its own** slide's media —
     * media now belongs to the slide it was added to, not the whole story — and
     * `dependsOn` only the offline uploads staged on that same slide, so the drainer
     * gates each story on exactly its own prerequisites and grafts the real ids in.
     */
    private fun publishPlans(current: StoryComposerUiState, language: String): List<PublishPlan> {
        val pendingCmids = current.pendingUploads.mapTo(mutableSetOf(), PendingMediaUpload::cmid)
        return current.deck.publishableSlides.map { slide ->
            val draft = StoryComposerDraft(
                text = slide.text,
                visibility = current.draft.visibility,
                mediaIds = slide.mediaIds,
                textElements = slide.elements,
                stickers = slide.stickers,
                strokes = slide.strokes,
                filter = slide.filter,
                filterIntensity = slide.filterIntensity,
                durationSecondsPin = slide.durationSecondsPin,
                background = slide.background,
                backgroundMedia = resolveBackgroundMedia(slide, current),
                repostOfId = current.draft.repostOfId,
            )
            PublishPlan(
                request = draft.toCreateStoryRequest(language),
                dependsOn = slide.mediaIds.filter { it in pendingCmids },
            )
        }
    }

    /**
     * Resolves a [slide]'s designated background media to the [StoryBackgroundMedia] the
     * wire mapping needs, from the already-uploaded [attachments]. Returns `null` when
     * nothing is designated or the id has no uploaded media yet (a still-pending offline
     * upload has no server URL to point the reader's background layer at, so it publishes
     * as a plain flat-media slide until the upload lands) — never a broken object. Carries
     * the slide's author-chosen [StorySlide.backgroundLoop] (honoured only for a video) and
     * the [resolveBackgroundFraming] pan/zoom (honoured for a framed image or video alike).
     */
    private fun resolveBackgroundMedia(slide: StorySlide, state: StoryComposerUiState): StoryBackgroundMedia? {
        val attachments = state.attachments
        val media = slide.backgroundMediaId?.let { bgId -> attachments.firstOrNull { it.id == bgId } } ?: return null
        return StoryBackgroundMedia(
            mediaId = media.id,
            url = media.url,
            mimeType = media.mimeType,
            durationSeconds = media.durationMs?.let { it / 1000.0 },
            loop = slide.backgroundLoop,
            framing = resolveBackgroundFraming(slide, media, state),
        )
    }

    /**
     * Projects the slide's canvas pan/zoom onto the wire's normalised framing — but only when
     * the designated background is the media the canvas actually frames. The composer canvas
     * renders (and the pan/zoom gesture reframes) the slide's **first** resolved attachment;
     * if the author designated a *different* attachment as the background, that gesture never
     * framed it, so its framing stays [StoryBackgroundFraming.IDENTITY] rather than borrowing a
     * pan the author applied to another attachment. Applies to an image or a video background
     * identically — each client's reader honours the framing on both.
     */
    private fun resolveBackgroundFraming(
        slide: StorySlide,
        media: UploadedMedia,
        state: StoryComposerUiState,
    ): StoryBackgroundFraming {
        val framedMediaId = slide.mediaIds.firstOrNull { id -> state.attachments.any { it.id == id } }
        if (media.id != framedMediaId) return StoryBackgroundFraming.IDENTITY
        return slide.transform.toBackgroundFraming(state.canvasWidthPx, state.canvasHeightPx)
    }

    private fun resolvePublishLanguage(): String =
        sessionRepository.currentUser.value
            ?.let { LanguageResolver.resolveUserLanguage(it) }
            ?: LanguageResolver.FALLBACK_LANGUAGE

    internal companion object {
        const val MEDIA_FAILED = "Couldn't attach that media"
        const val MEDIA_UNUSABLE = "That media couldn't be attached"
        const val MEDIA_LIMIT = "You can attach up to ${StoryComposerDraft.MAX_MEDIA} items"
        const val TEXT_ELEMENT_LIMIT =
            "You can add up to ${StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE} text elements per slide"
        const val STICKER_LIMIT =
            "You can add up to ${StorySlideDeck.MAX_STICKERS_PER_SLIDE} stickers per slide"
        const val MEDIA_RESTORE_LOST = "Some media couldn't be restored"
    }
}
