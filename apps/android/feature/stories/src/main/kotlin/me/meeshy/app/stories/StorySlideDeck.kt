package me.meeshy.app.stories

import me.meeshy.sdk.model.media.MediaTrimBounds

import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDurationPin
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StoryObjectPlacement
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectCaps
import me.meeshy.sdk.model.composer.StoryLimits
import me.meeshy.sdk.model.composer.scene.SceneFrame
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import me.meeshy.sdk.model.scene.StoryFilterMatrix

/**
 * A z-order restack of an on-canvas text element within its slide's paint order.
 * The slide's `elements` list order *is* the paint order — index 0 is the back,
 * the last index the front — so these map onto a list move:
 * [TO_BACK]/[TO_FRONT] jump to either end, [BACKWARD]/[FORWARD] step one place.
 * Mirrors the iOS composer's front/back + forward/backward layering controls.
 */
enum class StoryZOrder { TO_BACK, BACKWARD, FORWARD, TO_FRONT }

/**
 * One slide of a multi-slide story draft. [id] is stable across the slide's life
 * (a duplicate mints a fresh one). A slide carries its caption [text], attached
 * [mediaIds], and its 9:16 canvas [transform] (the persisted pan/zoom of its
 * content); richer element-level content (text styling, audio, drawing) layers on
 * in later slices, reusing this same identity.
 */
data class StorySlide(
    val id: String,
    val text: String = "",
    val mediaIds: List<String> = emptyList(),
    val transform: StoryCanvasTransform = StoryCanvasTransform.IDENTITY,
    val elements: List<StoryTextElement> = emptyList(),
    val stickers: List<StoryStickerElement> = emptyList(),
    val strokes: List<StoryDrawingStroke> = emptyList(),
    val filter: StoryFilter? = null,
    val filterIntensity: Float = StoryFilterMatrix.DEFAULT_INTENSITY,
    val durationSecondsPin: Double? = null,
    val background: StoryBackgroundValue? = null,
    val backgroundMediaId: String? = null,
    val backgroundLoop: Boolean = true,
    /** La fenêtre gardée de la vidéo de FOND dans sa source (iOS `sourceStart`/`sourceEnd` de l'objet `isBackground`, #13973) ; `null` : entière. */
    val backgroundTrim: MediaTrimBounds? = null,
    /** Le quart de tour du FOND et le volume d'une vidéo de fond (iOS `rotation` / `volume` de l'objet `isBackground`, #14083). */
    val backgroundSetting: StoryBackgroundSetting = StoryBackgroundSetting(),
    /** Les sons de la slide (fond + premier plan) : le fond appartient à la SLIDE, pas à la publication. */
    val audio: List<StoryAudioPlayerObject> = emptyList(),
    /** Cadrage du fond média, fond de ses bandes, ouverture et fermeture : ce que le panneau Cadre et les effets règlent. */
    val frame: SceneFrame = SceneFrame(),
    /** La durée de SOURCE de chaque piste (identifiant -> secondes), retenue à l'emprunt : le Temps remplace `duration`, pas elle. */
    val soundSources: Map<String, Float> = emptyMap(),
    /** Les médias de la slide POSÉS sur la scène (hors fond), chacun avec sa pose ; ils partent en `mediaObjects[]`. */
    val placedMedia: List<StoryPlacedMedia> = emptyList(),
    /** Les réglages et effets du média de FOND (iOS `StoryMediaObject.adjustments` de l'objet `isBackground`, #13652) ; `null` : rien de réglé. */
    val backgroundAdjustments: ImageAdjustments? = null,
    /** Les pastilles de lieu posées sur la scène (#13846), dans l'ordre de leur pose ; elles partent en `locationObjects[]`. */
    val places: List<StoryLocationObject> = emptyList(),
    /** La transcription de chaque piste (identifiant -> charge du fil) : elle suit la piste, rognée ou déplacée (#13848). */
    val soundTranscriptions: Map<String, me.meeshy.sdk.model.MobileTranscriptionPayload> = emptyMap(),
    /** Les vidéos s'atténuent sous le son de fond (iOS `isDuckingDisabled`, réglé ici pour la diapo entière). */
    val videosDuckUnderSound: Boolean = true,
    /** Le look de chaque média de la diapo (#13841), posé ou de fond : un RÉGLAGE peint en direct, cuit à la publication seulement. */
    val mediaLooks: Map<String, me.meeshy.sdk.model.StoryMediaLook> = emptyMap(),
)

/**
 * Pure, immutable state of the multi-slide composer — the structural rules behind
 * the future canvas. It enforces two invariants the UI must never violate: the
 * deck always holds **at least one** slide, and **at most [MAX_SLIDES]** (the iOS
 * ≤10 cap). Add / duplicate / remove / move / select are total functions that
 * return the same instance when the operation cannot apply (cap reached, last
 * slide, unknown id), so the ViewModel/Screen stay glue and the rules are fully
 * unit-tested.
 *
 * Ids are caller-supplied (the ViewModel mints them) so the reducer stays pure and
 * deterministic — no clock, no randomness here.
 */
data class StorySlideDeck(
    val slides: List<StorySlide>,
    val selectedId: String,
) {
    init {
        require(slides.isNotEmpty()) { "a slide deck always holds at least one slide" }
        require(slides.any { it.id == selectedId }) { "selectedId must reference a present slide" }
    }

    /** Number of slides currently in the deck (always ≥ 1). */
    val size: Int get() = slides.size

    /** The cap is reached — no further slide may be added or duplicated. */
    val isFull: Boolean get() = size >= MAX_SLIDES

    /** A slide may still be added (below the [MAX_SLIDES] cap). */
    val canAddSlide: Boolean get() = size < MAX_SLIDES

    /** A slide may be removed only while more than one remains. */
    val canRemoveSlide: Boolean get() = size > 1

    /** Position of the selected slide (always valid — invariant-guaranteed). */
    val selectedIndex: Int get() = slides.indexOfFirst { it.id == selectedId }

    /** The currently selected slide. */
    val selectedSlide: StorySlide get() = slides[selectedIndex]

    /** At least one slide carries publishable (non-blank) text. */
    val hasText: Boolean get() = slides.any { it.text.isNotBlank() }

    /** At least one slide carries attached media. */
    val hasMedia: Boolean get() = slides.any { it.mediaIds.isNotEmpty() }

    /** At least one slide carries a publishable (non-blank) on-canvas text element. */
    val hasTextElements: Boolean get() = slides.any { slide -> slide.elements.any { it.isPublishable } }

    /** At least one slide carries a publishable (non-blank emoji) on-canvas sticker. */
    val hasStickers: Boolean get() = slides.any { slide -> slide.stickers.any { it.isPublishable } }

    /** At least one slide carries a freehand-drawn stroke. */
    val hasDrawing: Boolean get() = slides.any { it.strokes.isNotEmpty() }

    /** At least one slide carries a sound track (a borrowed or captured sound alone publishes). */
    val hasAudio: Boolean get() = slides.any { it.audio.isNotEmpty() }

    /** At least one slide carries a place pastille (#13846). */
    val hasPlaces: Boolean get() = slides.any { it.places.isNotEmpty() }

    /** Une image de sticker dont les octets ne sont pas arrivés : la publier la perdrait, la publication l'attend. */
    val awaitsStickerImage: Boolean get() = slides.any { slide -> slide.stickers.any { it.isAwaitingImage } }

    /**
     * The slides that would each become a published story — those carrying real
     * content (non-blank text **or** attached media **or** a publishable text
     * element **or** a publishable sticker **or** a drawn stroke), in order. A
     * media-only, text-element-only, sticker-only, or drawing-only slide publishes;
     * a slide with none of these is skipped.
     */
    val publishableSlides: List<StorySlide>
        get() = slides.filter { slide ->
            slide.text.isNotBlank() ||
                slide.mediaIds.isNotEmpty() ||
                slide.elements.any { it.isPublishable } ||
                slide.stickers.any { it.isPublishable } ||
                slide.strokes.isNotEmpty() ||
                slide.audio.isNotEmpty() ||
                slide.places.isNotEmpty()
        }

    /** Free media slots left on the **selected** slide; never negative so the UI can size a pick. */
    val selectedRemainingMediaSlots: Int
        get() = SceneObjectCaps.remainingMediaSlots(selectedSlide.mediaIds.size)

    /** La slide sélectionnée peut porter un média de plus : cinquante médias visuels ; les sons ont leur propre seau (#13590). */
    val selectedCanAddMedia: Boolean get() = selectedRemainingMediaSlots > 0

    /** Free text-element slots left on the **selected** slide; never negative. */
    val selectedRemainingTextSlots: Int
        get() = (MAX_TEXT_ELEMENTS_PER_SLIDE - selectedSlide.elements.size).coerceAtLeast(0)

    /** A text element may still be added to the **selected** slide (below the per-slide cap). */
    val selectedCanAddTextElement: Boolean get() = selectedRemainingTextSlots > 0

    /** Free sticker slots left on the **selected** slide; never negative. */
    val selectedRemainingStickerSlots: Int
        get() = (MAX_STICKERS_PER_SLIDE - selectedSlide.stickers.size).coerceAtLeast(0)

    /** A sticker may still be added to the **selected** slide (below the per-slide cap). */
    val selectedCanAddSticker: Boolean get() = selectedRemainingStickerSlots > 0

    /** Every slide's raw text is within [maxChars] (surrounding whitespace counts). */
    fun isWithinTextLimit(maxChars: Int): Boolean = slides.all { it.text.length <= maxChars }

    /**
     * Every slide's VISUAL media count is within the per-slide cap ([MAX_MEDIA_PER_SLIDE]). The shared ten
     * (media + sounds, [selectedCanAddMedia]) gates ADDING only, as on iOS, whose publish gate counts nothing:
     * a draft composed before the shared cap may carry more, and it still publishes, nothing dropped.
     */
    fun isWithinMediaLimit(): Boolean = slides.all { it.mediaIds.size <= MAX_MEDIA_PER_SLIDE }

    /** Every slide's text-element count is within the per-slide cap ([MAX_TEXT_ELEMENTS_PER_SLIDE]). */
    fun isWithinTextElementLimit(): Boolean = slides.all { it.elements.size <= MAX_TEXT_ELEMENTS_PER_SLIDE }

    /** Every slide's sticker count is within the per-slide cap ([MAX_STICKERS_PER_SLIDE]). */
    fun isWithinStickerLimit(): Boolean = slides.all { it.stickers.size <= MAX_STICKERS_PER_SLIDE }

    /**
     * Appends [mediaId] to the **selected** slide's media, leaving every other slide
     * and the selection untouched. Inert (same instance) when the id is already on
     * that slide or the slide is at the [MAX_MEDIA_PER_SLIDE] cap, so the caller can
     * stay glue and the ≤10-per-story invariant holds in one place.
     */
    fun addMediaToSelected(mediaId: String): StorySlideDeck {
        val selected = selectedSlide
        if (mediaId in selected.mediaIds || !selectedCanAddMedia) return this
        val index = selectedIndex
        val next = slides.mapIndexed { i, slide ->
            if (i == index) slide.copy(mediaIds = slide.mediaIds + mediaId) else slide
        }
        return copy(slides = next)
    }

    /**
     * Removes [mediaId] from whichever slide holds it (a media id lives on exactly
     * one slide), preserving order, selection, and every other slide. Inert when no
     * slide carries the id.
     */
    fun removeMedia(mediaId: String): StorySlideDeck {
        if (slides.none { mediaId in it.mediaIds }) return this
        val next = slides.map { slide ->
            if (mediaId in slide.mediaIds) {
                val clearsBackground = slide.backgroundMediaId == mediaId
                slide.copy(
                    mediaIds = slide.mediaIds - mediaId,
                    placedMedia = slide.placedMedia.filterNot { it.mediaId == mediaId },
                    backgroundMediaId = slide.backgroundMediaId.takeIf { !clearsBackground },
                    backgroundLoop = if (clearsBackground) true else slide.backgroundLoop,
                    backgroundTrim = slide.backgroundTrim.takeIf { !clearsBackground },
                    backgroundAdjustments = slide.backgroundAdjustments.takeIf { !clearsBackground },
                    backgroundSetting = if (clearsBackground) StoryBackgroundSetting() else slide.backgroundSetting,
                    mediaLooks = slide.mediaLooks - mediaId,
                )
            } else {
                slide
            }
        }
        return copy(slides = next)
    }

    /**
     * Appends [element] (with its position clamped into the canvas) to the
     * **selected** slide's text elements, leaving every other slide and the selection
     * untouched. Inert (same instance) when an element with that id already exists on
     * the selected slide or the slide is at the [MAX_TEXT_ELEMENTS_PER_SLIDE] cap, so
     * the caller stays glue and the ≤5-per-slide invariant holds in one place.
     */
    fun addTextElementToSelected(element: StoryTextElement): StorySlideDeck {
        val selected = selectedSlide
        if (selected.elements.any { it.id == element.id } || selected.elements.size >= MAX_TEXT_ELEMENTS_PER_SLIDE) {
            return this
        }
        val index = selectedIndex
        val next = slides.mapIndexed { i, slide ->
            if (i == index) slide.copy(elements = slide.elements + element.normalised().copy(zIndex = StorySceneStack.nextZ(slide))) else slide
        }
        return copy(slides = next)
    }

    /**
     * Removes the text element [id] from whichever slide holds it (an element id lives
     * on exactly one slide), preserving order, selection, and every other slide. Inert
     * when no slide carries the id.
     */
    fun removeTextElement(id: String): StorySlideDeck {
        if (slides.none { slide -> slide.elements.any { it.id == id } }) return this
        val next = slides.map { slide ->
            if (slide.elements.any { it.id == id }) {
                slide.copy(elements = slide.elements.filterNot { it.id == id })
            } else {
                slide
            }
        }
        return copy(slides = next)
    }

    /**
     * Rewrites the text element [id] via [transform] wherever it lives (re-clamping
     * its position), leaving every other element, slide, and the selection untouched.
     * Inert when no slide carries the id.
     */
    fun updateTextElement(id: String, transform: (StoryTextElement) -> StoryTextElement): StorySlideDeck {
        if (slides.none { slide -> slide.elements.any { it.id == id } }) return this
        val next = slides.map { slide ->
            if (slide.elements.none { it.id == id }) {
                slide
            } else {
                slide.copy(
                    elements = slide.elements.map { element ->
                        if (element.id == id) transform(element).normalised() else element
                    },
                )
            }
        }
        return copy(slides = next)
    }

    /**
     * Translates the text element [id] by the normalised canvas deltas [dx]/[dy]
     * (clamped to the canvas by [StoryTextElement.nudged]). Inert when the id is
     * unknown. The on-canvas drag binds here so the move math lives in one place.
     */
    fun moveTextElement(id: String, dx: Float, dy: Float): StorySlideDeck =
        updateTextElement(id) { it.nudged(dx, dy) }

    /**
     * Pinch-scales and rotates the text element [id] by the incremental gesture
     * deltas (clamped/wrapped by the pure [StoryTextElement.transformed]). Inert when
     * the id is unknown. The on-canvas `detectTransformGestures` callback binds here so
     * the transform math lives in one place alongside the move/style reducers.
     */
    fun transformTextElement(id: String, scaleBy: Float, rotateByDeg: Float): StorySlideDeck =
        updateTextElement(id) { it.transformed(scaleBy, rotateByDeg) }

    /**
     * Inserts a clone of the text element [sourceId] (carrying every styled field) as
     * a new element [newId] immediately after it on whichever slide holds it, nudged by
     * the normalised canvas deltas [dx]/[dy] (clamped by [StoryTextElement.nudged]) so
     * the copy is visibly offset rather than hidden behind the original. Inert (same
     * instance) when [sourceId] is unknown, [newId] already exists on any slide, or the
     * holding slide is at the [MAX_TEXT_ELEMENTS_PER_SLIDE] cap — so the ≤5-per-slide
     * invariant holds in one place and the caller stays glue. The selection (which the
     * deck does not own) is left to the ViewModel.
     */
    fun duplicateTextElement(sourceId: String, newId: String, dx: Float, dy: Float): StorySlideDeck {
        if (slides.any { slide -> slide.elements.any { it.id == newId } }) return this
        val slideIndex = slides.indexOfFirst { slide -> slide.elements.any { it.id == sourceId } }
        if (slideIndex < 0) return this
        val slide = slides[slideIndex]
        if (slide.elements.size >= MAX_TEXT_ELEMENTS_PER_SLIDE) return this
        val sourceIndex = slide.elements.indexOfFirst { it.id == sourceId }
        val clone = slide.elements[sourceIndex].copy(id = newId).nudged(dx, dy)
        val nextElements = slide.elements.toMutableList().apply { add(sourceIndex + 1, clone) }
        val next = slides.mapIndexed { i, s -> if (i == slideIndex) s.copy(elements = nextElements) else s }
        return copy(slides = next)
    }

    /**
     * Restacks the text element [id] on the ONE pile of its slide's scene objects ([StorySceneStack], #13852): a step or
     * to either end, across texts, placed media, stickers, places and voices. Inert (same instance) when [id] is unknown
     * or the move would not change the order.
     */
    fun reorderTextElement(id: String, op: StoryZOrder): StorySlideDeck =
        restacked(SceneObjectRef(ComposerObjectKind.TEXT, id), op)

    /**
     * Appends [sticker] (with its position clamped into the canvas) to the **selected**
     * slide's stickers, leaving every other slide and the selection untouched. Inert
     * (same instance) when a sticker with that id already exists on the selected slide
     * or the slide is at the [MAX_STICKERS_PER_SLIDE] cap, so the caller stays glue and
     * the per-slide invariant holds in one place. Mirrors [addTextElementToSelected].
     */
    fun addStickerToSelected(sticker: StoryStickerElement): StorySlideDeck {
        val selected = selectedSlide
        if (selected.stickers.any { it.id == sticker.id } || selected.stickers.size >= MAX_STICKERS_PER_SLIDE) {
            return this
        }
        val index = selectedIndex
        val next = slides.mapIndexed { i, slide ->
            if (i == index) slide.copy(stickers = slide.stickers + sticker.normalised().copy(zIndex = StorySceneStack.nextZ(slide))) else slide
        }
        return copy(slides = next)
    }

    /**
     * Removes the sticker [id] from whichever slide holds it (a sticker id lives on
     * exactly one slide), preserving order, selection, and every other slide. Inert
     * when no slide carries the id.
     */
    fun removeSticker(id: String): StorySlideDeck {
        if (slides.none { slide -> slide.stickers.any { it.id == id } }) return this
        val next = slides.map { slide ->
            if (slide.stickers.any { it.id == id }) {
                slide.copy(stickers = slide.stickers.filterNot { it.id == id })
            } else {
                slide
            }
        }
        return copy(slides = next)
    }

    /**
     * Rewrites the sticker [id] via [transform] wherever it lives (re-clamping its
     * position/scale/rotation), leaving every other sticker, slide, and the selection
     * untouched. Inert when no slide carries the id.
     */
    fun updateSticker(id: String, transform: (StoryStickerElement) -> StoryStickerElement): StorySlideDeck {
        if (slides.none { slide -> slide.stickers.any { it.id == id } }) return this
        val next = slides.map { slide ->
            if (slide.stickers.none { it.id == id }) {
                slide
            } else {
                slide.copy(
                    stickers = slide.stickers.map { sticker ->
                        if (sticker.id == id) transform(sticker).normalised() else sticker
                    },
                )
            }
        }
        return copy(slides = next)
    }

    /**
     * Translates the sticker [id] by the normalised canvas deltas [dx]/[dy] (clamped by
     * [StoryStickerElement.nudged]). Inert when the id is unknown. The on-canvas drag
     * binds here so the move math lives in one place.
     */
    fun moveSticker(id: String, dx: Float, dy: Float): StorySlideDeck =
        updateSticker(id) { it.nudged(dx, dy) }

    /**
     * Pinch-scales and rotates the sticker [id] by the incremental gesture deltas
     * (clamped/wrapped by [StoryStickerElement.transformed]). Inert when the id is
     * unknown. The on-canvas `detectTransformGestures` callback binds here.
     */
    fun transformSticker(id: String, scaleBy: Float, rotateByDeg: Float): StorySlideDeck =
        updateSticker(id) { it.transformed(scaleBy, rotateByDeg) }

    /**
     * Rewrites the **selected** slide's [text], leaving its id and media — and every
     * other slide and the selection — untouched. The editor binds here so each slide
     * keeps its own caption as the user moves between slides.
     */
    /** Réécrit le texte de CHAQUE slide (la publication est un seul niveau : retirer un hashtag les touche toutes). */
    fun mapSlideTexts(transform: (String) -> String): StorySlideDeck =
        copy(slides = slides.map { slide -> slide.copy(text = transform(slide.text)) })

    fun updateSelectedText(text: String): StorySlideDeck {
        val index = selectedIndex
        val next = slides.mapIndexed { i, slide -> if (i == index) slide.copy(text = text) else slide }
        return copy(slides = next)
    }

    /**
     * Rewrites the **selected** slide's canvas [transform], leaving its id, text, and
     * media — and every other slide and the selection — untouched. The canvas binds
     * here so each slide keeps its own pan/zoom as the user moves between slides.
     */
    fun updateSelectedTransform(transform: StoryCanvasTransform): StorySlideDeck {
        val index = selectedIndex
        val next = slides.mapIndexed { i, slide -> if (i == index) slide.copy(transform = transform) else slide }
        return copy(slides = next)
    }

    /** Rewrites the **selected** slide's [SceneFrame] through [change], leaving every other slide untouched. */
    fun updateSelectedFrame(change: (SceneFrame) -> SceneFrame): StorySlideDeck {
        val index = selectedIndex
        val next = slides.mapIndexed { i, slide -> if (i == index) slide.copy(frame = change(slide.frame)) else slide }
        return copy(slides = next)
    }

    /**
     * Sets the **selected** slide's photo [filter] (null clears it), leaving its id,
     * text, media, and canvas transform — and every other slide and the selection —
     * untouched. The Effets filter picker binds here so each slide keeps its own look.
     */
    fun setSelectedFilter(filter: StoryFilter?): StorySlideDeck {
        val index = selectedIndex
        val next = slides.mapIndexed { i, slide -> if (i == index) slide.copy(filter = filter) else slide }
        return copy(slides = next)
    }

    /**
     * Sets the **selected** slide's filter [intensity] (clamped/guarded by
     * [StoryFilterMatrix.clampIntensity]), leaving every other slide and the selection
     * untouched. The strength slider binds here so the clamp lives in one place.
     */
    fun setSelectedFilterIntensity(intensity: Float): StorySlideDeck {
        val clamped = StoryFilterMatrix.clampIntensity(intensity)
        val index = selectedIndex
        val next = slides.mapIndexed { i, slide -> if (i == index) slide.copy(filterIntensity = clamped) else slide }
        return copy(slides = next)
    }

    /**
     * Pins the **selected** slide's on-screen duration to [seconds] (bounded by the
     * single-source [StoryDurationPin.clamp] to `[2, 600]`s, iOS parity), leaving every
     * other slide and the selection untouched. This is the authoring counterpart of the
     * reader-side [StorySlideDuration]: the pin serialises to `effects.timelineDuration`
     * and wins over content on playback. Inert (same instance) when the clamped value
     * already equals the slide's pin, so the slider never churns recomposition.
     */
    fun setSelectedDuration(seconds: Double): StorySlideDeck {
        val clamped = StoryLimits.durationWithinBudget(
            wanted = StoryDurationPin.clamp(seconds),
            usedByOthers = totalDurationSeconds - selectedSlideDurationSeconds,
            floor = StoryDurationPin.MIN_SECONDS,
        )
        if (selectedSlide.durationSecondsPin == clamped) return this
        val index = selectedIndex
        val next = slides.mapIndexed { i, slide -> if (i == index) slide.copy(durationSecondsPin = clamped) else slide }
        return copy(slides = next)
    }

    /**
     * The **selected** slide's effective on-screen duration in seconds — the author's
     * [StorySlide.durationSecondsPin] when set, otherwise the content-derived value from
     * the single-source [StorySlideDuration] (mirroring iOS's
     * `timelineDuration ?? computedTotalDuration()` getter). The composer models only the
     * on-canvas caption text so far, so the fallback is fed the publishable text elements;
     * a background media pipeline will extend the same call when it lands.
     */
    val selectedSlideDurationSeconds: Double get() = slideDurationSeconds(selectedSlide)

    /** La durée effective d'UNE slide : son épingle, sinon celle que son contenu impose. */
    fun slideDurationSeconds(slide: StorySlide): Double = slide.durationSecondsPin ?: StorySlideDuration.contentDerivedSeconds(
        mediaObjects = null,
        audioPlayerObjects = null,
        textObjects = slide.elements
            .filter { it.isPublishable }
            .map { StoryTextObject(id = it.id, text = it.text) },
    )

    /** La durée de la story entière : toutes les slides additionnées, bornée à deux heures par [StoryLimits.TOTAL_SECONDS]. */
    val totalDurationSeconds: Double get() = slides.sumOf { slideDurationSeconds(it) }

    /** La durée totale tient dans les deux heures (#13590). */
    fun isWithinTotalDuration(): Boolean = totalDurationSeconds <= StoryLimits.TOTAL_SECONDS

    /** Chaque texte posé tient dans [StoryLimits.TEXT_LENGTH] caractères (un brouillon antérieur au plafond doit être raccourci). */
    fun isWithinElementTextLimit(): Boolean =
        slides.all { slide -> slide.elements.all { it.text.codePointCount(0, it.text.length) <= StoryLimits.TEXT_LENGTH } }

    /** Chaque scène tient dans les plafonds de cinquante par famille (médias, sons, textes, stickers). */
    fun isWithinSceneCaps(): Boolean = isWithinMediaLimit() && isWithinTextElementLimit() && isWithinStickerLimit() && isWithinSoundLimit()

    /** Chaque scène porte au plus cinquante sons. */
    fun isWithinSoundLimit(): Boolean = slides.all { it.audio.size <= SceneObjectCaps.AUDIO }

    /** The **selected** slide's author-chosen backdrop, or `null` when none is set. */
    val selectedSlideBackground: StoryBackgroundValue? get() = selectedSlide.background

    /**
     * Sets the **selected** slide's backdrop to [background] (a solid or gradient from
     * [me.meeshy.sdk.model.StoryBackgroundPalette], or `null` to clear it), leaving every
     * other slide and the selection untouched. The value serialises to `effects.background`
     * and the reader honours it over its accent→black fallback ([StoryBackgroundValue]).
     * Inert (same instance) when the requested value already equals the slide's backdrop,
     * so the picker never churns recomposition.
     */
    fun setSelectedBackground(background: StoryBackgroundValue?): StorySlideDeck {
        if (selectedSlide.background == background) return this
        val index = selectedIndex
        val next = slides.mapIndexed { i, slide -> if (i == index) slide.copy(background = background) else slide }
        return copy(slides = next)
    }

    /** The media id designated as the **selected** slide's looping background, or `null`. */
    val selectedSlideBackgroundMediaId: String? get() = selectedSlide.backgroundMediaId

    /** True when [mediaId] is the **selected** slide's designated looping-background media. */
    fun isSelectedBackgroundMedia(mediaId: String): Boolean = selectedSlide.backgroundMediaId == mediaId

    /**
     * Whether the **selected** slide's designated background loops. Meaningful only for a
     * VIDEO background (an image always loops on the reader); `true` by default so a fresh
     * designation starts looping, matching the reader's `loop ?: true`.
     */
    val selectedSlideBackgroundLoop: Boolean get() = selectedSlide.backgroundLoop

    /**
     * Toggles which of the **selected** slide's media is its single looping background —
     * the authoring counterpart of the reader's `isBackground` [me.meeshy.sdk.model.StoryMediaObject]
     * selection. **At most one** media per slide may be the background: designating [mediaId]
     * replaces any prior designation, and designating the current background again clears it
     * (a natural on/off tap). Inert (same instance) when [mediaId] is not attached to the
     * selected slide, so the ≤1-background invariant lives in one place and the caller stays
     * glue. Every other slide and the selection are left untouched. Designated from a placed [objectId] (#13905), only that
     * object leaves the scene: its copies of the same file stay posed, as iOS carries `isBackground` per object. A source
     * left posed under the file's own id takes the departed copy's id, so no posed object is ever named like the background.
     */
    fun toggleSelectedBackgroundMedia(mediaId: String, objectId: String? = null): StorySlideDeck {
        val selected = selectedSlide
        if (mediaId !in selected.mediaIds) return this
        val next = if (selected.backgroundMediaId == mediaId) null else mediaId
        val index = selectedIndex
        val slidesNext = slides.mapIndexed { i, slide ->
            // A fresh designation always starts looping (the default); a stale
            // author-chosen `loop = false` must never carry over to a new background.
            // Le fond et la scène s'excluent, comme `isBackground` sur iOS : désigner un média posé le retire de la scène.
            if (i == index) {
                slide.copy(
                    backgroundMediaId = next,
                    backgroundLoop = true,
                    backgroundTrim = null,
                    backgroundAdjustments = null,
                    backgroundSetting = StoryBackgroundSetting(),
                    placedMedia = when {
                        next == null -> slide.placedMedia
                        objectId != null && slide.placedMedia.any { it.id == objectId && it.mediaId == next } ->
                            slide.placedMedia.filterNot { it.id == objectId }.map { if (it.id == next) it.copy(id = objectId) else it }
                        else -> slide.placedMedia.filterNot { it.mediaId == next }
                    },
                )
            } else {
                slide
            }
        }
        return copy(slides = slidesNext)
    }

    /**
     * Sets whether the **selected** slide's designated background loops (the authoring
     * counterpart of the reader's `loop` on the `isBackground`
     * [me.meeshy.sdk.model.StoryMediaObject]). Inert (same instance) when the selected slide
     * has **no** designated background media — a loop preference without a background is a
     * control with no effect — or when [loop] already equals the slide's value. Every other
     * slide and the selection are left untouched.
     */
    fun setSelectedBackgroundLoop(loop: Boolean): StorySlideDeck {
        val selected = selectedSlide
        if (selected.backgroundMediaId == null || selected.backgroundLoop == loop) return this
        val index = selectedIndex
        val slidesNext = slides.mapIndexed { i, slide ->
            if (i == index) slide.copy(backgroundLoop = loop) else slide
        }
        return copy(slides = slidesNext)
    }

    /**
     * La fenêtre gardée de la vidéo de fond [mediaId] de la slide choisie (#13973) ; comme ses réglages, la couper la
     * DÉSIGNE si le plateau la peignait sans désignation. Inerte si [mediaId] n'est ni le fond ni le candidat, ou si rien ne change.
     */
    fun setSelectedBackgroundTrim(mediaId: String, trim: MediaTrimBounds?): StorySlideDeck {
        val selected = selectedSlide
        val designated = selected.backgroundMediaId
        if (mediaId !in selected.mediaIds || (designated != null && designated != mediaId)) return this
        if (designated == mediaId && selected.backgroundTrim == trim) return this
        val index = selectedIndex
        return copy(slides = slides.mapIndexed { i, slide ->
            if (i != index) slide
            else slide.copy(
                backgroundMediaId = mediaId,
                backgroundLoop = if (designated == null) true else slide.backgroundLoop,
                placedMedia = slide.placedMedia.filterNot { it.mediaId == mediaId },
                backgroundTrim = trim,
            )
        })
    }

    /**
     * Règle les réglages et effets du fond de la slide choisie (#13652). Le média [mediaId] est le fond désigné ; sans fond
     * désigné, régler le média que le plateau peint en fond le DÉSIGNE (sinon ses réglages n'auraient pas d'objet de fond à
     * qui s'écrire au fil). Un sac neutre s'efface (`null`). Inerte si [mediaId] n'est pas le fond ni le candidat, ou si rien ne change.
     */
    fun setSelectedBackgroundAdjustments(mediaId: String, adjustments: ImageAdjustments?): StorySlideDeck {
        val selected = selectedSlide
        val designated = selected.backgroundMediaId
        if (mediaId !in selected.mediaIds || (designated != null && designated != mediaId)) return this
        val next = adjustments?.takeUnless { it.isNeutral }
        if (designated == mediaId && selected.backgroundAdjustments == next) return this
        if (designated == null && next == null) return this
        val index = selectedIndex
        return copy(slides = slides.mapIndexed { i, slide ->
            if (i != index) slide
            else slide.copy(
                backgroundMediaId = mediaId,
                backgroundLoop = if (designated == null) true else slide.backgroundLoop,
                placedMedia = slide.placedMedia.filterNot { it.mediaId == mediaId },
                backgroundAdjustments = next,
            )
        })
    }

    /**
     * Replaces the **selected** slide's freehand [strokes] wholesale, leaving every
     * other slide and the selection untouched. The composer's drawing tool binds
     * here after every board mutation (commit / undo / redo / clear), so the
     * per-slide undo/redo reducer ([StoryDrawingBoard]) stays the single source of
     * the committed strokes and this deck only mirrors its output. Inert (same
     * instance) when [strokes] already equals the slide's strokes, so a mutation
     * that resolves to a no-op (e.g. undoing with nothing to undo) never churns
     * recomposition.
     */
    fun setSelectedStrokes(strokes: List<StoryDrawingStroke>): StorySlideDeck {
        if (selectedSlide.strokes == strokes) return this
        val index = selectedIndex
        val next = slides.mapIndexed { i, slide -> if (i == index) slide.copy(strokes = strokes) else slide }
        return copy(slides = next)
    }

    /**
     * Appends a fresh empty slide with [newId] and selects it. Inert (same
     * instance) when the cap is reached or [newId] already exists.
     */
    fun addSlide(newId: String): StorySlideDeck {
        if (!canAddSlide || slides.any { it.id == newId }) return this
        return copy(slides = slides + StorySlide(id = newId), selectedId = newId)
    }

    /**
     * Inserts a clone of [sourceId]'s content (with [newId]) immediately after it
     * and selects the clone. Inert when the cap is reached, [sourceId] is unknown,
     * or [newId] collides with an existing slide.
     */
    fun duplicate(sourceId: String, newId: String): StorySlideDeck {
        if (!canAddSlide || slides.any { it.id == newId }) return this
        val index = slides.indexOfFirst { it.id == sourceId }
        if (index < 0) return this
        val clone = slides[index].copy(id = newId)
        val next = slides.toMutableList().apply { add(index + 1, clone) }
        return copy(slides = next, selectedId = newId)
    }

    /**
     * Removes the slide with [id]. Inert when [id] is unknown or only one slide
     * remains (the deck never empties). When the removed slide was selected, the
     * slide that takes its position becomes selected (the new last when it was the
     * last); otherwise the selection is preserved.
     */
    fun removeSlide(id: String): StorySlideDeck {
        if (!canRemoveSlide) return this
        val index = slides.indexOfFirst { it.id == id }
        if (index < 0) return this
        val next = slides.filterIndexed { i, _ -> i != index }
        val nextSelected = when {
            id != selectedId -> selectedId
            else -> next[index.coerceAtMost(next.lastIndex)].id
        }
        return copy(slides = next, selectedId = nextSelected)
    }

    /**
     * Moves the slide with [id] to [toIndex] (clamped to `0..size-1`), preserving
     * the selection by id. Inert when [id] is unknown or it would not move.
     */
    fun move(id: String, toIndex: Int): StorySlideDeck {
        val from = slides.indexOfFirst { it.id == id }
        if (from < 0) return this
        val target = toIndex.coerceIn(0, slides.lastIndex)
        if (target == from) return this
        val next = slides.toMutableList().apply { add(target, removeAt(from)) }
        return copy(slides = next)
    }

    /** Selects the slide with [id]. Inert when [id] is unknown. */
    fun select(id: String): StorySlideDeck {
        if (id == selectedId || slides.none { it.id == id }) return this
        return copy(selectedId = id)
    }

    /**
     * Où poser un objet NEUF de la slide sélectionnée : jamais sur un texte ou un sticker déjà
     * posé (cascade de [StoryObjectPlacement], le premier reste au centre).
     */
    fun nextObjectPosition(): StoryObjectPlacement.Point = StoryObjectPlacement.next(
        selectedSlide.elements.map { StoryObjectPlacement.Point(it.x.toDouble(), it.y.toDouble()) } +
            selectedSlide.stickers.map { StoryObjectPlacement.Point(it.x.toDouble(), it.y.toDouble()) } +
            selectedSlide.placedMedia.map { StoryObjectPlacement.Point(it.x.toDouble(), it.y.toDouble()) },
    )

    companion object {
        /** Maximum slides per story — parity with the iOS composer's `maxSlides`. */
        const val MAX_SLIDES: Int = 10

        /** Maximum media attachments per slide — each slide becomes one ≤10-media story (iOS parity). */
        const val MAX_MEDIA_PER_SLIDE: Int = SceneObjectCaps.MEDIA

        /** Maximum on-canvas text elements per slide — parity with the iOS composer's ≤5 rule. */
        const val MAX_TEXT_ELEMENTS_PER_SLIDE: Int = SceneObjectCaps.TEXT

        /**
         * Maximum on-canvas stickers per slide. iOS enforces no hard composer cap (its
         * rasterizer LRU is a 100-entry cache, not a count limit), so we set a generous
         * upper bound that prevents a pathological slide from carrying an unbounded
         * sticker count while never getting in a real user's way.
         */
        const val MAX_STICKERS_PER_SLIDE: Int = SceneObjectCaps.STICKER

        /** A fresh deck of a single empty slide, selected. */
        fun single(slideId: String): StorySlideDeck =
            StorySlideDeck(slides = listOf(StorySlide(id = slideId)), selectedId = slideId)
    }
}
