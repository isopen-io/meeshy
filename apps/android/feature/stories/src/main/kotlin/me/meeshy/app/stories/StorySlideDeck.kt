package me.meeshy.app.stories

/**
 * One slide of a multi-slide story draft. [id] is stable across the slide's life
 * (a duplicate mints a fresh one). For now a slide carries its caption [text] and
 * attached [mediaIds]; richer element-level content (text styling, audio, drawing)
 * layers on in later slices, reusing this same identity.
 */
data class StorySlide(
    val id: String,
    val text: String = "",
    val mediaIds: List<String> = emptyList(),
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

        /** A fresh deck of a single empty slide, selected. */
        fun single(slideId: String): StorySlideDeck =
            StorySlideDeck(slides = listOf(StorySlide(id = slideId)), selectedId = slideId)
    }
}
