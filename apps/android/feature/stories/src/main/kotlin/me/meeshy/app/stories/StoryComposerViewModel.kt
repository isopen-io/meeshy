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
import me.meeshy.sdk.model.StoryFilter
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

/** Mints a fresh, collision-free text-element id (same impure-edge rationale). */
private fun newTextElementId(): String = UUID.randomUUID().toString()

/** Mints a fresh, collision-free sticker id (same impure-edge rationale). */
private fun newStickerId(): String = UUID.randomUUID().toString()

/** Normalised canvas offset given to a duplicated element so the copy is visibly
 * clear of its source rather than hidden directly behind it. */
private const val DUPLICATE_ELEMENT_OFFSET: Float = 0.04f

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
 * Transient on-canvas feedback shown **only while an element is being dragged**: which
 * alignment guide line(s) the element has snapped onto ([verticalGuide]/[horizontalGuide],
 * normalised positions; `null` when that axis is free) and whether the element is still
 * inside the safe zone ([withinSafeZone] = `false` ⇒ the canvas flashes an out-of-bounds
 * warning). It is cleared the instant the drag ends, so it never lingers as state. The
 * snap math itself lives in the pure [StorySnapResolver]; this just carries its verdict
 * to the Composable.
 */
@Immutable
data class SnapFeedback(
    val verticalGuide: Float?,
    val horizontalGuide: Float?,
    val withinSafeZone: Boolean,
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
    val selectedTextElementId: String? = null,
    val selectedStickerId: String? = null,
    val snapFeedback: SnapFeedback? = null,
    val band: ComposerBandState = ComposerBandState.Hidden,
    val isUploadingMedia: Boolean = false,
    val isPublishing: Boolean = false,
    val errorMessage: String? = null,
) {
    /**
     * Publishable when some slide carries text, media **or** a publishable text
     * element, every slide is within the character cap, the per-slide media and
     * text-element caps hold, and nothing is in flight. The whole **deck** gates
     * publishing — not just the slide currently being edited — so an over-long
     * off-screen slide, or media/elements on an off-screen slide, all count.
     */
    val canPublish: Boolean
        get() = (deck.hasText || deck.hasMedia || deck.hasTextElements || deck.hasStickers) &&
            deck.isWithinTextLimit(StoryComposerDraft.MAX_CHARS) &&
            deck.isWithinMediaLimit() &&
            deck.isWithinTextElementLimit() &&
            deck.isWithinStickerLimit() &&
            !isPublishing &&
            !isUploadingMedia

    /**
     * The uploaded media of the **selected** slide, in slide order — the preview the
     * composer renders for the slide currently being edited. [attachments] is the
     * global pool (one entry per upload across all slides); this projects it onto the
     * selected slide via that slide's [StorySlide.mediaIds].
     */
    val selectedSlideAttachments: List<UploadedMedia>
        get() = deck.selectedSlide.mediaIds.mapNotNull { id -> attachments.firstOrNull { it.id == id } }

    /** The offline-pending media of the **selected** slide, in slide order. */
    val selectedSlidePending: List<PendingMediaUpload>
        get() = deck.selectedSlide.mediaIds.mapNotNull { id -> pendingUploads.firstOrNull { it.cmid == id } }

    /** The persisted 9:16 canvas pan/zoom of the **selected** slide — what the canvas renders. */
    val selectedSlideTransform: StoryCanvasTransform
        get() = deck.selectedSlide.transform

    /** The on-canvas text elements of the **selected** slide, in z-order, for rendering. */
    val selectedSlideTextElements: List<StoryTextElement>
        get() = deck.selectedSlide.elements

    /** The on-canvas stickers of the **selected** slide, in order, for rendering. */
    val selectedSlideStickers: List<StoryStickerElement>
        get() = deck.selectedSlide.stickers

    /**
     * The sticker currently selected for manipulation — the [selectedStickerId]
     * resolved against the **selected** slide. Null when nothing is selected or the id
     * no longer lives on the selected slide (e.g. after a slide switch), so the screen
     * never shows a stale remove handle.
     */
    val selectedSticker: StoryStickerElement?
        get() = selectedStickerId?.let { id -> deck.selectedSlide.stickers.firstOrNull { it.id == id } }

    /** The photo filter applied to the **selected** slide, or null when none is set. */
    val selectedSlideFilter: StoryFilter?
        get() = deck.selectedSlide.filter

    /** The **selected** slide's filter strength (0..1) — what the Effets slider shows. */
    val selectedSlideFilterIntensity: Float
        get() = deck.selectedSlide.filterIntensity

    /**
     * The effective colour matrix the canvas renders for the **selected** slide's
     * media — the neutral identity when no filter is set, otherwise the filter blended
     * toward identity by its strength. Computed in one pure place
     * ([StoryFilterMatrix.effectiveMatrix]) so the Composable stays glue.
     */
    val selectedSlideFilterMatrix: StoryColorMatrix
        get() = StoryFilterMatrix.effectiveMatrix(selectedSlideFilter, selectedSlideFilterIntensity)

    /**
     * The text element currently being edited — the [selectedTextElementId] resolved
     * against the **selected** slide. Null when nothing is being edited (caption mode)
     * or the id no longer lives on the selected slide (e.g. after a slide switch), so
     * the screen never edits a stale element.
     */
    val selectedTextElement: StoryTextElement?
        get() = selectedTextElementId?.let { id -> deck.selectedSlide.elements.firstOrNull { it.id == id } }

    /** True while the text field edits an on-canvas element rather than the slide caption. */
    val isEditingTextElement: Boolean get() = selectedTextElement != null

    /**
     * What the single text field shows and edits: the selected element's text while
     * one is selected, otherwise the selected slide's caption. One field, two roles —
     * the screen stays glue.
     */
    val editorText: String get() = selectedTextElement?.text ?: draft.text
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

    /**
     * Routes the text field: while a text element is selected the keystrokes rewrite
     * **that element**; otherwise they rewrite the **selected slide's caption** (the
     * original behaviour). One field serves both roles so the canvas stays a single
     * coherent surface.
     */
    fun onTextChange(text: String) {
        val editingId = _state.value.selectedTextElement?.id
        if (editingId != null) {
            _state.update {
                it.copy(deck = it.deck.updateTextElement(editingId) { element -> element.copy(text = text) }, errorMessage = null)
            }
            return
        }
        _state.update {
            val deck = it.deck.updateSelectedText(text)
            it.copy(draft = it.draft.withText(text), deck = deck, errorMessage = null)
        }
    }

    /**
     * Adds an empty on-canvas text element to the selected slide (clamped to the
     * canvas centre by the deck) and selects it so the field begins editing it
     * immediately — the natural "tap +Text, then type" flow. Inert-with-a-warning
     * once the selected slide is at the ≤5-element cap.
     */
    fun onAddTextElement() {
        val before = _state.value.deck
        if (!before.selectedCanAddTextElement) {
            _state.update { it.copy(errorMessage = TEXT_ELEMENT_LIMIT) }
            return
        }
        val id = newTextElementId()
        _state.update {
            it.copy(
                deck = it.deck.addTextElementToSelected(StoryTextElement(id = id)),
                selectedTextElementId = id,
                selectedStickerId = null,
                errorMessage = null,
            )
        }
    }

    /** Begins editing the on-canvas element [id] (inert when it is not on the selected slide). */
    fun onSelectTextElement(id: String) {
        _state.update {
            if (it.deck.selectedSlide.elements.none { element -> element.id == id }) it
            else it.copy(selectedTextElementId = id, selectedStickerId = null)
        }
    }

    /** Stops editing the active element — the field returns to the slide caption. */
    fun onDeselectTextElement() {
        _state.update { if (it.selectedTextElementId == null) it else it.copy(selectedTextElementId = null) }
    }

    /**
     * Drags the on-canvas element [id] by the normalised canvas deltas [dx]/[dy], with
     * **magnetic snapping**: the resulting centre is run through the pure
     * [StorySnapResolver], which locks each axis onto the nearest alignment guide within
     * its threshold and reports the active guide lines + safe-zone verdict as transient
     * [SnapFeedback] (cleared by [onTextElementDragEnd]). The element is then moved by the
     * snap-adjusted delta through the existing [StorySlideDeck.moveTextElement] path, so
     * the canvas clamp still lives in one place. Selection and editing are untouched, and
     * an unknown id (or one not on the selected, draggable slide) is inert. The Composable
     * converts drag pixels to fractions and renders the returned guides/warning.
     */
    fun onTextElementMoved(id: String, dx: Float, dy: Float) {
        _state.update { state ->
            val element = state.deck.selectedSlide.elements.firstOrNull { it.id == id }
                ?: return@update state
            val snap = StorySnapResolver.resolve(element.x + dx, element.y + dy)
            state.copy(
                deck = state.deck.moveTextElement(id, snap.x - element.x, snap.y - element.y),
                snapFeedback = SnapFeedback(snap.verticalGuide, snap.horizontalGuide, snap.withinSafeZone),
            )
        }
    }

    /**
     * Ends an on-canvas drag: drops the transient [SnapFeedback] so the guide lines and
     * any out-of-bounds warning disappear the moment the finger lifts. Inert when no
     * feedback is showing, so a stray drag-end never churns state.
     */
    fun onTextElementDragEnd() {
        _state.update { if (it.snapFeedback == null) it else it.copy(snapFeedback = null) }
    }

    /**
     * Removes the on-canvas element [id] from whichever slide holds it, clearing the
     * editing selection when it was the one being edited so the field falls back to
     * the slide caption.
     */
    fun onRemoveTextElement(id: String) {
        _state.update {
            val selected = if (it.selectedTextElementId == id) null else it.selectedTextElementId
            it.copy(deck = it.deck.removeTextElement(id), selectedTextElementId = selected)
        }
    }

    /**
     * Restyles the on-canvas element [id] (inert when the id is unknown). Selection
     * and editing are untouched — you style the element you are editing. The wire
     * mapping ([StoryTextElement.toTextObject]) carries the style on publish.
     */
    fun onTextElementStyle(id: String, style: StoryTextStyle) {
        _state.update { it.copy(deck = it.deck.updateTextElement(id) { element -> element.copy(style = style) }) }
    }

    /** Recolours the on-canvas element [id] ([color] is a `RRGGBB` hex; inert on unknown id). */
    fun onTextElementColor(id: String, color: String) {
        _state.update { it.copy(deck = it.deck.updateTextElement(id) { element -> element.copy(color = color) }) }
    }

    /** Realigns the on-canvas element [id]'s lines (inert on unknown id). */
    fun onTextElementAlign(id: String, align: StoryTextAlign) {
        _state.update { it.copy(deck = it.deck.updateTextElement(id) { element -> element.copy(align = align) }) }
    }

    /**
     * Pinch-scales / rotates the on-canvas element [id] by the incremental gesture
     * deltas ([scaleBy] is the multiplicative pinch factor, [rotateByDeg] the additive
     * rotation; clamped/wrapped by the pure [StoryTextElement.transformed]). Selection
     * and editing are untouched — you transform the element you are manipulating — and
     * an unknown id is inert. The wire mapping carries `scale`/`rotation` on publish.
     */
    fun onTextElementTransform(id: String, scaleBy: Float, rotateByDeg: Float) {
        _state.update { it.copy(deck = it.deck.transformTextElement(id, scaleBy, rotateByDeg)) }
    }

    /**
     * Duplicates the on-canvas element [id] (which must live on the selected slide):
     * mints a fresh id, inserts a clone of every styled field just after the source —
     * nudged by [DUPLICATE_ELEMENT_OFFSET] so the copy is visibly offset — and selects
     * the copy so the user can immediately move/style it. Inert when [id] is not on the
     * selected slide; inert-with-a-warning once the slide is at the ≤5-element cap. The
     * clone/cap rules live in the pure [StorySlideDeck.duplicateTextElement].
     */
    /**
     * Restacks the on-canvas element [id] within its slide's paint order per [op]
     * (back / one-step-back / one-step-forward / front). Selection and editing are
     * untouched — you restack the element you are editing — and an inert move (unknown
     * id, already at the extreme, single element) leaves the state instance unchanged
     * so it never churns recomposition. The order rules live in the pure
     * [StorySlideDeck.reorderTextElement].
     */
    fun onReorderTextElement(id: String, op: StoryZOrder) {
        _state.update { state ->
            val deck = state.deck.reorderTextElement(id, op)
            if (deck === state.deck) state else state.copy(deck = deck)
        }
    }

    fun onDuplicateTextElement(id: String) {
        val before = _state.value.deck
        if (before.selectedSlide.elements.none { it.id == id }) return
        if (!before.selectedCanAddTextElement) {
            _state.update { it.copy(errorMessage = TEXT_ELEMENT_LIMIT) }
            return
        }
        val newId = newTextElementId()
        _state.update {
            it.copy(
                deck = it.deck.duplicateTextElement(id, newId, DUPLICATE_ELEMENT_OFFSET, DUPLICATE_ELEMENT_OFFSET),
                selectedTextElementId = newId,
                errorMessage = null,
            )
        }
    }

    /**
     * Adds an on-canvas emoji sticker [emoji] to the selected slide (clamped to the
     * canvas centre by the deck) and selects it so the user can immediately drag /
     * pinch / remove it. A blank emoji is ignored (nothing to place). Inert-with-a-
     * warning once the selected slide is at the [StorySlideDeck.MAX_STICKERS_PER_SLIDE]
     * cap. Selecting the new sticker clears any text-element editing so the canvas keeps
     * a single selected object.
     */
    fun onAddSticker(emoji: String) {
        if (emoji.isBlank()) return
        val before = _state.value.deck
        if (!before.selectedCanAddSticker) {
            _state.update { it.copy(errorMessage = STICKER_LIMIT) }
            return
        }
        val id = newStickerId()
        _state.update {
            it.copy(
                deck = it.deck.addStickerToSelected(StoryStickerElement(id = id, emoji = emoji)),
                selectedStickerId = id,
                selectedTextElementId = null,
                errorMessage = null,
            )
        }
    }

    /** Selects the sticker [id] for manipulation (inert when it is not on the selected
     * slide); clears any text-element editing so only one object is selected. */
    fun onSelectSticker(id: String) {
        _state.update {
            if (it.deck.selectedSlide.stickers.none { sticker -> sticker.id == id }) it
            else it.copy(selectedStickerId = id, selectedTextElementId = null)
        }
    }

    /** Deselects the active sticker — the remove handle disappears. Inert when none is selected. */
    fun onDeselectSticker() {
        _state.update { if (it.selectedStickerId == null) it else it.copy(selectedStickerId = null) }
    }

    /**
     * Removes the sticker [id] from whichever slide holds it, clearing the selection
     * when it was the selected one so the canvas stops showing its remove handle.
     */
    fun onRemoveSticker(id: String) {
        _state.update {
            val selected = if (it.selectedStickerId == id) null else it.selectedStickerId
            it.copy(deck = it.deck.removeSticker(id), selectedStickerId = selected)
        }
    }

    /**
     * Drags the sticker [id] by the normalised canvas deltas [dx]/[dy] (clamped by the
     * pure [StorySlideDeck.moveSticker]). Inert when the id is unknown. The Composable
     * converts drag pixels to fractions.
     */
    fun onStickerMoved(id: String, dx: Float, dy: Float) {
        _state.update { it.copy(deck = it.deck.moveSticker(id, dx, dy)) }
    }

    /**
     * Pinch-scales / rotates the sticker [id] by the incremental gesture deltas
     * (clamped/wrapped by the pure [StoryStickerElement.transformed]). Inert when the id
     * is unknown. Selection is untouched — you transform the sticker you are manipulating.
     */
    fun onStickerTransform(id: String, scaleBy: Float, rotateByDeg: Float) {
        _state.update { it.copy(deck = it.deck.transformSticker(id, scaleBy, rotateByDeg)) }
    }

    fun onVisibilityChange(visibility: StoryVisibility) {
        _state.update { it.copy(draft = it.draft.withVisibility(visibility)) }
    }

    /**
     * Toggles the bottom-band drawer for [category] (the Contenu / Effets FABs): opens
     * it, switches category, or closes it per the pure [ComposerBandState.tapFab]. All
     * band navigation state lives in the unit-tested [ComposerBandState].
     */
    fun onBandFabTap(category: BandCategory) {
        _state.update { it.copy(band = it.band.tapFab(category)) }
    }

    /** Dismisses the band drawer (swipe-down gesture) — back to FAB-only. */
    fun onBandDismiss() {
        _state.update { it.copy(band = it.band.swipeDown()) }
    }

    /** Swaps the open band to the other category (horizontal swipe); inert while hidden. */
    fun onBandSwapCategory() {
        _state.update { it.copy(band = it.band.swipeHorizontal()) }
    }

    /** Appends a fresh empty slide and selects it (inert at the ≤10-slide cap); the
     * editor follows the new selection, so it clears to the empty slide's text. */
    fun onAddSlide() = applyDeck { it.addSlide(newSlideId()) }

    /** Inserts a clone of the selected slide right after it and selects the clone. */
    fun onDuplicateSelectedSlide() = applyDeck { it.duplicate(it.selectedId, newSlideId()) }

    /**
     * Removes the slide [id] (inert on the last remaining slide / unknown id) and
     * reclaims its media: each of the removed slide's media ids is dropped from the
     * global preview pools, and any offline-pending upload among them is **cancelled**
     * ([MediaUploadQueue.cancel]) so a slide thrown away never leaves an orphaned
     * `UPLOAD_MEDIA` row streaming bytes to a story it no longer belongs to.
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

    /** Reorders the slide [id] to [toIndex] (selection preserved by id). */
    fun onMoveSlide(id: String, toIndex: Int) = applyDeck { it.move(id, toIndex) }

    /** Switches the active slide to [id] (inert on unknown id). */
    fun onSelectSlide(id: String) = applyDeck { it.select(id) }

    /**
     * Applies one incremental pinch-zoom + drag-pan gesture from the 9:16 canvas to
     * the **selected** slide's persisted [StoryCanvasTransform], clamped to the canvas
     * bounds via the pure [StoryCanvasTransform.apply]. The Composable supplies the
     * gesture deltas and the measured canvas size; all transform math is unit-tested
     * in one place, so the canvas stays glue.
     */
    fun onCanvasTransform(panX: Float, panY: Float, zoom: Float, canvasWidth: Float, canvasHeight: Float) =
        applyDeck { deck ->
            deck.updateSelectedTransform(
                deck.selectedSlide.transform.apply(panX, panY, zoom, canvasWidth, canvasHeight),
            )
        }

    /**
     * Sets (or clears, with null) the **selected** slide's photo filter — the Effets
     * drawer's filter picker. Per-slide: each slide keeps its own look. The selection
     * and any in-progress element edit are preserved (a filter touches no element).
     */
    fun onSelectFilter(filter: StoryFilter?) = applyDeck { it.setSelectedFilter(filter) }

    /**
     * Sets the **selected** slide's filter strength (clamped in the deck via the pure
     * [StoryFilterMatrix.clampIntensity]) — the Effets drawer's intensity slider.
     */
    fun onFilterIntensityChange(intensity: Float) = applyDeck { it.setSelectedFilterIntensity(intensity) }

    /**
     * Applies a structural deck transform and re-syncs the editor buffer to the
     * (possibly new) selected slide's text **and** media, keeping `draft` a faithful
     * mirror of the selected slide — the single invariant the screen relies on.
     */
    private inline fun applyDeck(transform: (StorySlideDeck) -> StorySlideDeck) {
        _state.update { it.copy(deck = transform(it.deck)).mirrorDraftToSelection() }
    }

    /**
     * Re-points [StoryComposerUiState.draft] at the selected slide's text + media and
     * drops a now-dangling element-edit selection (an element id only ever lives on
     * one slide, so switching/removing a slide ends element editing and the field
     * falls back to the new slide's caption).
     */
    private fun StoryComposerUiState.mirrorDraftToSelection(): StoryComposerUiState {
        val elementId = selectedTextElementId
        val stillSelected = elementId != null && deck.selectedSlide.elements.any { it.id == elementId }
        val stickerId = selectedStickerId
        val stickerStillSelected = stickerId != null && deck.selectedSlide.stickers.any { it.id == stickerId }
        return copy(
            draft = draft.withText(deck.selectedSlide.text).withMediaIds(deck.selectedSlide.mediaIds),
            selectedTextElementId = if (stillSelected) elementId else null,
            selectedStickerId = if (stickerStillSelected) stickerId else null,
        )
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
            val cmid = mediaUploadQueue.enqueue(item)
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
                filter = slide.filter,
                filterIntensity = slide.filterIntensity,
            )
            PublishPlan(
                request = draft.toCreateStoryRequest(language),
                dependsOn = slide.mediaIds.filter { it in pendingCmids },
            )
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
        const val TEXT_ELEMENT_LIMIT =
            "You can add up to ${StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE} text elements per slide"
        const val STICKER_LIMIT =
            "You can add up to ${StorySlideDeck.MAX_STICKERS_PER_SLIDE} stickers per slide"
    }
}
