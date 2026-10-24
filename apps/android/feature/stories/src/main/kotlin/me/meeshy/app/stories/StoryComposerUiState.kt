package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerBandState
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import me.meeshy.sdk.model.scene.StoryColorMatrix
import me.meeshy.sdk.model.scene.StoryFilterMatrix
import java.util.UUID

/** Mints a fresh, collision-free slide id. The pure [StorySlideDeck] reducer stays
 * deterministic — id generation lives here, at the impure ViewModel edge. */
internal fun newSlideId(): String = UUID.randomUUID().toString()

/** Mints a fresh, collision-free text-element id (same impure-edge rationale). */
internal fun newTextElementId(): String = UUID.randomUUID().toString()

/** Mints a fresh, collision-free sticker id (same impure-edge rationale). */
internal fun newStickerId(): String = UUID.randomUUID().toString()

/** Mints a fresh, collision-free drawn-stroke id (same impure-edge rationale). */
internal fun newStrokeId(): String = UUID.randomUUID().toString()


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
    val elementMenuId: String? = null,
    val selectedStickerId: String? = null,
    val snapFeedback: SnapFeedback? = null,
    val band: ComposerBandState = ComposerBandState.Hidden,
    val isDrawingActive: Boolean = false,
    val drawingBoard: StoryDrawingBoard = StoryDrawingBoard(),
    val drawColorHex: String = StoryDrawingPalette.DEFAULT_COLOR,
    val drawWidthDesign: Double = StoryDrawingPalette.DEFAULT_WIDTH,
    val isUploadingMedia: Boolean = false,
    val isPublishing: Boolean = false,
    val errorMessage: String? = null,
    val canvasWidthPx: Float = 0f,
    val canvasHeightPx: Float = 0f,
    val canUndo: Boolean = false,
    val canRedo: Boolean = false,
) {
    /**
     * Publishable when some slide carries text, media **or** a publishable text
     * element, every slide is within the character cap, the per-slide media and
     * text-element caps hold, and nothing is in flight. The whole **deck** gates
     * publishing — not just the slide currently being edited — so an over-long
     * off-screen slide, or media/elements on an off-screen slide, all count.
     */
    val canPublish: Boolean
        get() = (deck.hasText || deck.hasMedia || deck.hasTextElements || deck.hasStickers || deck.hasDrawing) &&
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

    /** The freehand strokes drawn on the **selected** slide, in draw order, for rendering. */
    val selectedSlideStrokes: List<StoryDrawingStroke>
        get() = deck.selectedSlide.strokes

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
     * The unified long-press context menu for the element [elementMenuId] on the selected
     * slide, or `null` when no menu is open (or the id no longer resolves, e.g. after the
     * element was removed) — the pure [StoryElementMenu.resolve] decides which of edit /
     * duplicate / reorder / delete may fire, so the screen renders a greyed row it can
     * never mis-dispatch and stays glue.
     */
    val elementContextMenu: StoryElementContextMenu?
        get() = elementMenuId?.let { StoryElementMenu.resolve(deck, it) }

    /**
     * The effective on-screen duration (seconds) of the **selected** slide — the
     * author's pin when set, otherwise the content-derived value — projected from the
     * pure [StorySlideDeck.selectedSlideDurationSeconds] so the duration control shows a
     * live value and the screen stays glue.
     */
    val selectedSlideDurationSeconds: Double get() = deck.selectedSlideDurationSeconds

    /**
     * The **selected** slide's author-chosen backdrop (`null` when none), projected from
     * the pure [StorySlideDeck.selectedSlideBackground] so the background picker can show
     * the active swatch and the screen stays glue.
     */
    val selectedSlideBackground: me.meeshy.sdk.model.StoryBackgroundValue?
        get() = deck.selectedSlideBackground

    /**
     * Whether the **selected** slide's designated background media is a VIDEO — the only
     * background kind whose looping is authorable (an image always loops on the reader).
     * The screen shows the loop toggle only when this is true, so the control is never a
     * no-op. Resolved against the uploaded [attachments] by the designated background id.
     */
    val selectedSlideBackgroundIsVideo: Boolean
        get() = deck.selectedSlideBackgroundMediaId
            ?.let { id -> attachments.firstOrNull { it.id == id } }
            ?.mimeType?.startsWith("video", ignoreCase = true) == true

    /**
     * Whether the **selected** slide's background loops — what the loop toggle reflects,
     * projected from the pure [StorySlideDeck.selectedSlideBackgroundLoop]. Meaningful only
     * while [selectedSlideBackgroundIsVideo] is true.
     */
    val selectedSlideBackgroundLoop: Boolean
        get() = deck.selectedSlideBackgroundLoop

    /**
     * What the single text field shows and edits: the selected element's text while
     * one is selected, otherwise the selected slide's caption. One field, two roles —
     * the screen stays glue.
     */
    val editorText: String get() = selectedTextElement?.text ?: draft.text
}

/**
 * Applies a structural deck transform and re-syncs the editor buffer to the (possibly new)
 * selected slide's text and media, keeping `draft` a faithful mirror of the selected slide —
 * the single invariant the screen relies on. Switching slide also re-seeds the drawing board.
 */
internal fun StoryComposerUiState.withDeckTransform(transform: (StorySlideDeck) -> StorySlideDeck): StoryComposerUiState {
    val nextDeck = transform(deck)
    val mirrored = copy(deck = nextDeck).mirrorDraftToSelection()
    return if (nextDeck.selectedId == deck.selectedId) mirrored
    else mirrored.copy(drawingBoard = StoryDrawingBoard(strokes = nextDeck.selectedSlide.strokes))
}

/**
 * Re-points [StoryComposerUiState.draft] at the selected slide's text + media and drops a
 * now-dangling element-edit selection (an element id only ever lives on one slide, so
 * switching/removing a slide ends element editing and the field falls back to the caption).
 */
internal fun StoryComposerUiState.mirrorDraftToSelection(): StoryComposerUiState {
    val elementId = selectedTextElementId
    val stillSelected = elementId != null && deck.selectedSlide.elements.any { it.id == elementId }
    val stickerId = selectedStickerId
    val stickerStillSelected = stickerId != null && deck.selectedSlide.stickers.any { it.id == stickerId }
    return copy(
        draft = draft.withText(deck.selectedSlide.text).withMediaIds(deck.selectedSlide.mediaIds),
        selectedTextElementId = if (stillSelected) elementId else null,
        selectedStickerId = if (stickerStillSelected) stickerId else null,
        drawingBoard = drawingBoard.resyncedTo(deck.selectedSlide.strokes),
    )
}
