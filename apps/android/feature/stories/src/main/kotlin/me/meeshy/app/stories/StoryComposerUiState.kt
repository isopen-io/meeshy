package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.composer.ComposerAudienceSelection
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerFormatVariant
import me.meeshy.sdk.model.composer.scene.ComposerSceneBackground
import me.meeshy.sdk.model.composer.ComposerBandState
import me.meeshy.sdk.model.composer.ComposerHashtags
import me.meeshy.sdk.model.composer.ComposerMediaPlacement
import me.meeshy.sdk.model.composer.MediaDescriptionLaw
import me.meeshy.sdk.model.composer.StoryPublishTitle
import me.meeshy.sdk.model.composer.StoryToolMode
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
    /** Le texte touché sur la scène, SÉLECTIONNÉ sans être écrit (#13836) : son cadre et sa barre d'actions, pas de clavier. */
    val framedTextElementId: String? = null,
    val elementMenuId: String? = null,
    val stickerMenuId: String? = null,
    val playheadSeconds: Float = 0f,
    val selectedStickerId: String? = null,
    val snapFeedback: SnapFeedback? = null,
    val band: ComposerBandState = ComposerBandState.Hidden,
    val isDrawingActive: Boolean = false,
    val drawingBoard: StoryDrawingBoard = StoryDrawingBoard(),
    val drawColorHex: String = StoryDrawingPalette.DEFAULT_COLOR,
    val drawWidthDesign: Double = StoryDrawingPalette.DEFAULT_WIDTH,
    val isUploadingMedia: Boolean = false,
    /** Une ligne par média de la sélection en cours d'envoi, avec ses propres octets (#13429). */
    val uploadingMedia: List<MediaUploadProgress> = emptyList(),
    /** Où chaque média de la sélection en cours d'envoi se posera (R4 de #13863), décidé au choix, dans l'ordre des lignes. */
    val mediaLandings: List<ComposerMediaPlacement.Landing> = emptyList(),
    /** Les médias de la sélection en cours d'envoi, dans l'ordre des lignes : leur aperçu et leur poids (R5 de #13863). */
    val incomingMedia: List<MediaUploadItem> = emptyList(),
    /** Un envoi a échoué et ses octets sont gardés : la ligne d'erreur offre « Réessayer » (R5 de #13863). */
    val canRetryMedia: Boolean = false,
    /** Le réseau est coupé (#13959) : un média en file se dit « Hors ligne » — et seulement alors. */
    val isOffline: Boolean = false,
    /** Les médias en file qui repartent maintenant, composeur ouvert (#13959). */
    val resendingUploads: Set<String> = emptySet(),
    /** Les médias en file dont le dernier envoi a échoué en ligne : ils proposent « Réessayer » (#13959). */
    val failedUploads: Set<String> = emptySet(),
    val isPublishing: Boolean = false,
    /** Une story PUBLIÉE rouverte (#13632) : le bouton enregistre, et la scène reste à une slide. */
    val editing: Boolean = false,
    val errorMessage: String? = null,
    val canvasWidthPx: Float = 0f,
    val canvasHeightPx: Float = 0f,
    val canUndo: Boolean = false,
    val canRedo: Boolean = false,
    /** Le mode ANIMÉ de la scène : chaque objet a sa piste, un objet neuf entre à la tête de lecture. */
    val sceneIsAnimated: Boolean = false,
    /** La section de l'éditeur du texte dont les options sont ouvertes dans la colonne droite ; `null` ⇒ la première servie. */
    val openObjectSection: me.meeshy.sdk.model.composer.ComposerObjectEditorSection? = null,
    /** Le réglage du pinceau déplié dans la colonne droite. */
    val openDrawingControl: DrawingControl = DrawingControl.COLOR,
    /** Le média de la slide touché dans la rangée : ses sections s'ouvrent dans la colonne droite (jamais avec un texte ou un sticker). */
    val selectedMediaId: String? = null,
    /** La piste de la slide touchée dans la rangée du son. */
    val selectedSoundId: String? = null,
    /** La famille d'effets de scène dont le carrousel est ouvert au pied du plateau. */
    val openSceneEffect: me.meeshy.sdk.model.composer.scene.ComposerSceneEffect? = null,
    /** Le panneau Cadre de la scène est ouvert au pied du plateau (le bouton Cadre du rail gauche). */
    /** La pastille de lieu touchée sur la scène (#13846). */
    val selectedPlaceId: String? = null,
    /** Le format que l'hôte compose sur cette scène (#13863) : la story, le post ou le réel. */
    val format: ComposerFormat = ComposerFormat.STORY,
    /** « Texte du post » : le texte du post ou du réel, hors de la scène. */
    val postText: String = "",
    /** La disposition des scènes que l'hôte a armée pour le post. */
    val postLayout: MosaicLayoutMode? = null,
    /**
     * Les formats cochés que l'hôte pose avec [format] (#13919), dans l'ordre du menu : un seul geste les publie tous. [format]
     * reste le premier — celui que la scène suit — et ne se répète pas ici.
     */
    val checkedFormats: List<ComposerFormat> = emptyList(),
    /** Les formats d'un brouillon rouvert, ou ceux qu'un échec partiel laisse à republier : à rendre à l'hôte une fois. */
    val restoredFormats: List<ComposerFormat>? = null,
    /** Les formats qu'un geste de publication n'a pas fait partir (#13919) : la scène dit lesquels. */
    val publishFailedFormats: List<ComposerFormat> = emptyList(),
) {
    internal val variant: ComposerFormatVariant get() = ComposerFormatVariant.of(format)

    /** Ce qui part d'un seul geste : [format] d'abord, puis les autres formats cochés. */
    val publishedFormats: List<ComposerFormat> get() = listOf(format) + checkedFormats.filter { it != format }

    private val publishedVariants: List<ComposerFormatVariant> get() = publishedFormats.map(ComposerFormatVariant::of)

    /** « Texte du post » s'écrit dès qu'un post ou un réel est coché, même derrière une story. */
    val writesPostText: Boolean get() = publishedVariants.any { it.writesPostText }

    private val captionsSlides: Boolean get() = publishedVariants.any { it.captionsSlides }

    /** Les plafonds de la story tiennent dès qu'une story est cochée, même derrière un post. */
    private val keepsStoryLimits: Boolean get() = publishedVariants.any { it.keepsStoryLimits }

    /**
     * Publishable when some slide carries text, media **or** a publishable text
     * element, every slide is within the character cap, the per-slide media and
     * text-element caps hold, and nothing is in flight. The whole **deck** gates
     * publishing — not just the slide currently being edited — so an over-long
     * off-screen slide, or media/elements on an off-screen slide, all count.
     */
    val canPublish: Boolean
        get() = (writesPostText && postText.isNotBlank() || deck.hasText && captionsSlides || deck.hasMedia || deck.hasTextElements || deck.hasStickers || deck.hasDrawing || deck.hasAudio || deck.hasPlaces) &&
            publishBlock == null &&
            ComposerAudienceSelection.isPublishable(draft.visibility, draft.visibilityUserIds) &&
            !isPublishing &&
            !isUploadingMedia &&
            !deck.awaitsStickerImage

    /** Le plafond qui bloque la publication, ou `null` : l'écran en dit la raison, il ne grise pas le bouton en silence. */
    internal val publishBlock: StoryPublishBlock?
        get() = deck.publishBlock(StoryComposerDraft.MAX_CHARS, isRepost = !draft.repostOfId.isNullOrBlank())
            ?.takeUnless { !keepsStoryLimits && it in StoryPublishBlock.storyOnly }

    /** Les hashtags de la publication — DÉRIVÉS du texte de toutes les slides (du post, en post), jamais déclarés à côté. */
    val hashtags: List<String>
        get() = ComposerHashtags.tags(if (variant.writesPostText) postText else deck.slides.joinToString(" ") { it.text })

    /** Ce que le bouton de publication nomme : la story, le nombre de stories (une par slide), le post, le réel, ou chaque format coché. */
    val publishTitle: StoryPublishTitle
        get() = StoryPublishTitle.of(publishedFormats, slideCount = deck.publishableSlides.size, editing = editing)

    /** Une story publiée tient UNE slide : en édition l'ajout est fermé d'avance, plutôt que refusé à l'enregistrement. */
    val canAddSlide: Boolean get() = !editing && deck.canAddSlide

    /** Les médias de la slide sélectionnée sans texte alternatif — rappelés à l'auteur, jamais bloquants. */
    val undescribedMediaIds: List<String>
        get() = MediaDescriptionLaw.undescribed(deck.selectedSlide.mediaIds, draft.mediaAlt)

    /** L'extraction du son ne se propose que si un média de la publication est une vidéo. */
    val offersSoundExtraction: Boolean
        get() = attachments.any { it.mimeType.startsWith("video/") }

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

    /**
     * Le média que le plateau peint en fond : celui que la publication désigne (envoyé ou encore en attente), sinon le
     * premier média de la slide — jamais « le premier » quand un autre est désigné (loi 6 : l'aperçu ne ment pas). C'est
     * aussi celui que « Retirer le fond de la scène » retire : on retire ce que l'on voit.
     */
    val selectedSlideBackdropMediaId: String?
        get() = StoryPublishBackground.paintedId(deck.selectedSlide, this)

    /** Le fond peint attend encore sa file d'envoi (hors ligne, R5 de #13863) : la scène le dit « en attente ». */
    val selectedSlideBackdropIsPending: Boolean
        get() = selectedSlideBackdropMediaId?.let { id -> selectedSlidePending.any { it.cmid == id } } == true

    /** L'affiche du fond : sa vignette, l'image elle-même, ou pour une vidéo sans vignette l'image de son début ([ComposerVideoFrame]). */
    fun selectedSlideBackdropModel(mediaBaseUrl: String?): Any? {
        val id = selectedSlideBackdropMediaId ?: return null
        selectedSlideAttachments.firstOrNull { it.id == id }?.let { return ComposerPicture.of(it, mediaBaseUrl) }
        return selectedSlidePending.firstOrNull { it.cmid == id }?.item?.let { ComposerPicture.of(it) }
    }

    /** The persisted 9:16 canvas pan/zoom of the **selected** slide — what the canvas renders. */
    val selectedSlideTransform: StoryCanvasTransform
        get() = deck.selectedSlide.transform

    /** The on-canvas text elements of the **selected** slide, in z-order, for rendering. */
    val selectedSlideTextElements: List<StoryTextElement>
        get() = deck.selectedSlide.elements

    /** Les sons de la slide sélectionnée (fond + premier plan). */
    val selectedSlideAudio: List<me.meeshy.sdk.model.StoryAudioPlayerObject>
        get() = deck.selectedSlide.audio

    /** La scène accepte une piste de plus — ou le fond emprunté en REMPLACE un (jamais deux fonds). */
    val canBorrowSound: Boolean
        get() = me.meeshy.sdk.model.composer.sound.ComposerSoundPlacement.canBorrow(deck.selectedSlide.audio, deck.selectedSlide.mediaIds.size)

    /** Ce que la porte du son DIT au plafond : une scène pleine de médias n'est pas « cinq sons au plus ». */
    @get:androidx.annotation.StringRes
    val soundCapRefusal: Int
        get() = when (me.meeshy.sdk.model.composer.sound.ComposerSoundPlacement.borrowRefusal(deck.selectedSlide.audio, deck.selectedSlide.mediaIds.size)) {
            me.meeshy.sdk.model.composer.SceneObjectCaps.Reason.MEDIA_FULL -> me.meeshy.feature.stories.R.string.composer_scene_cap_media
            else -> me.meeshy.feature.stories.R.string.composer_scene_cap_sound
        }

    /** Le sélecteur système se règle sur les places de la SLIDE, sons compris — jamais sur les seuls médias du brouillon. */
    val mediaPickMode: StoryMediaPickMode
        get() = StoryMediaPicker.modeFor(deck.selectedRemainingMediaSlots)

    /** Le son de FOND de la slide sélectionnée — ce que la trace de la scène montre. */
    val selectedSlideBackgroundSound: me.meeshy.sdk.model.StoryAudioPlayerObject?
        get() = me.meeshy.sdk.model.composer.sound.ComposerSoundPlacement.background(deck.selectedSlide.audio)

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

    /** True while the text field edits an on-canvas element rather than the slide caption — a text only touched is framed, not written. */
    val isEditingTextElement: Boolean
        get() = selectedTextElement != null && !isTimelineOpen && selectedTextElementId != framedTextElementId

    /** La frise est le panneau ouvert : sélectionner un texte y règle sa fenêtre, sans clavier. */
    val isTimelineOpen: Boolean get() = band.activeTool == StoryToolMode.TIMELINE

    /**
     * The effective on-screen duration (seconds) of the **selected** slide — the
     * author's pin when set, otherwise the content-derived value — projected from the
     * pure [StorySlideDeck.selectedSlideDurationSeconds] so the duration control shows a
     * live value and the screen stays glue.
     */
    val selectedSlideDurationSeconds: Double get() = deck.slideDurationSeconds(deck.selectedSlide, selectedSlideBackdropMediaId, ::videoSourceSeconds)

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

    /** Le fond MÉDIA de la slide sélectionnée (image ou vidéo) — ce qui ouvre le cadre et les effets ; `null` sans fond média. */
    val selectedSlideSceneBackground: ComposerSceneBackground?
        get() = deck.selectedSlideBackgroundMediaId
            ?.let { id -> attachments.firstOrNull { it.id == id } }
            ?.let { if (it.mimeType.startsWith("video", ignoreCase = true)) ComposerSceneBackground.VIDEO else ComposerSceneBackground.IMAGE }

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
        selectedMediaId = selectedMediaId?.takeIf(deck.selectedSlide::holdsMediaObject),
        selectedSoundId = selectedSoundId?.takeIf { id -> deck.selectedSlide.audio.any { it.id == id } },
        selectedPlaceId = selectedPlaceId?.takeIf { id -> deck.selectedSlide.places.any { it.id == id } },
        drawingBoard = drawingBoard.resyncedTo(deck.selectedSlide.strokes),
    )
}

/** Les descriptions ne survivent pas à leur média : retirer un média purge son alt et sa légende. */
internal fun StoryComposerUiState.withDescriptionsPruned(): StoryComposerUiState {
    val present = deck.slides.flatMap { it.mediaIds }
    return copy(
        draft = draft.copy(
            mediaAlt = MediaDescriptionLaw.pruned(draft.mediaAlt, present),
            mediaCaption = MediaDescriptionLaw.pruned(draft.mediaCaption, present),
        ),
    )
}
