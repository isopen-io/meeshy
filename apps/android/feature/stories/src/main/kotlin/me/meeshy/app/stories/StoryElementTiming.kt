package me.meeshy.app.stories

/**
 * The pure, Compose-agnostic visibility timing of an on-canvas element — parity with the
 * iOS `StoryTextEditorView` start/duration timing fields (`StoryTextObject.startTime` /
 * `duration`, seconds, `0…30`).
 *
 * Held as a flat ([startSeconds], [durationSeconds]) pair because the two ends are
 * independent — iOS binds each to its own control — and each projects onto its own wire
 * field. [startSeconds] is when the element appears (offset into the slide); a
 * [durationSeconds] closes the visibility window, and a value of `0` ([NONE_SECONDS]) means
 * "open-ended: visible for the rest of the slide", exactly the value iOS folds back to `nil`,
 * so the wire mapping omits a zero end entirely. Both values live in the same second unit the
 * wire uses, and the reader gate ([StoryElementVisibility]) enforces the window this authors.
 */
data class StoryElementTiming(
    val startSeconds: Float = NONE_SECONDS,
    val durationSeconds: Float = NONE_SECONDS,
) {
    /** True once the element appears after the slide starts — [startSeconds] `> 0`. */
    val hasStart: Boolean get() = startSeconds > NONE_SECONDS

    /** True once the element's window closes before the slide ends — [durationSeconds] `> 0`. */
    val isTimed: Boolean get() = durationSeconds > NONE_SECONDS

    /** True when either end is authored; the toolbar reads this to tint its control. */
    val isActive: Boolean get() = hasStart || isTimed

    /** A copy with the start advanced one tap ([StoryElementTimingCycle.advance]); duration untouched. */
    fun cycledStart(): StoryElementTiming = copy(startSeconds = StoryElementTimingCycle.advance(startSeconds))

    /** A copy with the duration advanced one tap ([StoryElementTimingCycle.advance]); start untouched. */
    fun cycledDuration(): StoryElementTiming = copy(durationSeconds = StoryElementTimingCycle.advance(durationSeconds))

    companion object {
        /** The at-rest value — no start offset / open-ended window. */
        const val NONE_SECONDS: Float = 0f
    }
}

/**
 * The discrete second cycle a composer tap walks — the Android tap-friendly form of the iOS
 * `0…30 s` slider. One tap advances to the next longer step, wrapping past the longest back to
 * no timing. Every step stays within the iOS-accepted `0…30 s` range, so a cycled value always
 * round-trips through the wire the reader/exporter honour.
 */
object StoryElementTimingCycle {
    /** The offered seconds, short→long; a tap past the last wraps to [StoryElementTiming.NONE_SECONDS]. */
    val steps: List<Float> = listOf(1f, 2f, 3f, 5f, 10f, 15f, 30f)

    /**
     * The value one tap after [current]: the first [steps] value strictly greater than [current],
     * or [StoryElementTiming.NONE_SECONDS] once at or past the longest step (the wrap). A value
     * sitting *between* two steps advances to the next HIGHER step, so a tap always lengthens and
     * never surprises by shortening.
     */
    fun advance(current: Float): Float =
        steps.firstOrNull { it > current } ?: StoryElementTiming.NONE_SECONDS
}
