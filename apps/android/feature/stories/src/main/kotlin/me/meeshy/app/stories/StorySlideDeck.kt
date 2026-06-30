package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryFilter

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
    val filter: StoryFilter? = null,
    val filterIntensity: Float = StoryFilterMatrix.DEFAULT_INTENSITY,
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

    /**
     * The slides that would each become a published story — those carrying real
     * content (non-blank text **or** attached media **or** a publishable text
     * element **or** a publishable sticker), in order. A media-only, text-element-only,
     * or sticker-only slide publishes; a slide with none of these is skipped.
     */
    val publishableSlides: List<StorySlide>
        get() = slides.filter { slide ->
            slide.text.isNotBlank() ||
                slide.mediaIds.isNotEmpty() ||
                slide.elements.any { it.isPublishable } ||
                slide.stickers.any { it.isPublishable }
        }

    /** Free media slots left on the **selected** slide; never negative so the UI can size a pick. */
    val selectedRemainingMediaSlots: Int
        get() = (MAX_MEDIA_PER_SLIDE - selectedSlide.mediaIds.size).coerceAtLeast(0)

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

    /** Every slide's media count is within the per-slide cap ([MAX_MEDIA_PER_SLIDE]). */
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
        if (mediaId in selected.mediaIds || selected.mediaIds.size >= MAX_MEDIA_PER_SLIDE) return this
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
            if (mediaId in slide.mediaIds) slide.copy(mediaIds = slide.mediaIds - mediaId) else slide
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
            if (i == index) slide.copy(elements = slide.elements + element.normalised()) else slide
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
     * Restacks the on-canvas text element [id] within its holding slide's paint order
     * per [op] (the list order *is* the z-order: index 0 = back, last = front). The
     * other elements keep their relative order and every other slide and the selection
     * are untouched. Inert (same instance) when [id] is unknown or the move would not
     * change the order (already at the extreme, a single-element slide), so the ≤1
     * paint-order invariant lives in one place and the caller stays glue.
     */
    fun reorderTextElement(id: String, op: StoryZOrder): StorySlideDeck {
        val slideIndex = slides.indexOfFirst { slide -> slide.elements.any { it.id == id } }
        if (slideIndex < 0) return this
        val elements = slides[slideIndex].elements
        val from = elements.indexOfFirst { it.id == id }
        val target = when (op) {
            StoryZOrder.TO_BACK -> 0
            StoryZOrder.BACKWARD -> from - 1
            StoryZOrder.FORWARD -> from + 1
            StoryZOrder.TO_FRONT -> elements.lastIndex
        }.coerceIn(0, elements.lastIndex)
        if (target == from) return this
        val restacked = elements.toMutableList().apply { add(target, removeAt(from)) }
        val next = slides.mapIndexed { i, s -> if (i == slideIndex) s.copy(elements = restacked) else s }
        return copy(slides = next)
    }

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
            if (i == index) slide.copy(stickers = slide.stickers + sticker.normalised()) else slide
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

    companion object {
        /** Maximum slides per story — parity with the iOS composer's `maxSlides`. */
        const val MAX_SLIDES: Int = 10

        /** Maximum media attachments per slide — each slide becomes one ≤10-media story (iOS parity). */
        const val MAX_MEDIA_PER_SLIDE: Int = 10

        /** Maximum on-canvas text elements per slide — parity with the iOS composer's ≤5 rule. */
        const val MAX_TEXT_ELEMENTS_PER_SLIDE: Int = 5

        /**
         * Maximum on-canvas stickers per slide. iOS enforces no hard composer cap (its
         * rasterizer LRU is a 100-entry cache, not a count limit), so we set a generous
         * upper bound that prevents a pathological slide from carrying an unbounded
         * sticker count while never getting in a real user's way.
         */
        const val MAX_STICKERS_PER_SLIDE: Int = 30

        /** A fresh deck of a single empty slide, selected. */
        fun single(slideId: String): StorySlideDeck =
            StorySlideDeck(slides = listOf(StorySlide(id = slideId)), selectedId = slideId)
    }
}
