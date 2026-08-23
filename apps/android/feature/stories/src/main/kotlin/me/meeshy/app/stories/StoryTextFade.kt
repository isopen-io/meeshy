package me.meeshy.app.stories

/**
 * The pure, Compose-agnostic fade timing of an on-canvas text element — parity with the
 * iOS `StoryTextEditorView` fade in/out fields (`StoryTextObject.fadeIn` / `fadeOut`,
 * seconds, `0…5`).
 *
 * Held as a flat ([inSeconds], [outSeconds]) pair because the two ends are independent —
 * iOS binds each to its own control — and each projects onto its own wire field. A
 * duration of `0` ([NONE_SECONDS]) means "no fade on that end", exactly the value iOS
 * folds back to `nil`, so the wire mapping omits a zero end entirely. Both values live in
 * the same second unit the wire uses.
 */
data class StoryTextFade(
    val inSeconds: Float = NONE_SECONDS,
    val outSeconds: Float = NONE_SECONDS,
) {
    /** True once the element eases in — [inSeconds] `> 0`. */
    val hasFadeIn: Boolean get() = inSeconds > NONE_SECONDS

    /** True once the element eases out — [outSeconds] `> 0`. */
    val hasFadeOut: Boolean get() = outSeconds > NONE_SECONDS

    /** True when either end fades; the toolbar reads this to tint its control. */
    val isActive: Boolean get() = hasFadeIn || hasFadeOut

    /** A copy with the fade-in advanced one tap ([StoryTextFadeCycle.advance]); out untouched. */
    fun cycledIn(): StoryTextFade = copy(inSeconds = StoryTextFadeCycle.advance(inSeconds))

    /** A copy with the fade-out advanced one tap ([StoryTextFadeCycle.advance]); in untouched. */
    fun cycledOut(): StoryTextFade = copy(outSeconds = StoryTextFadeCycle.advance(outSeconds))

    companion object {
        /** The at-rest duration — no fade on that end. */
        const val NONE_SECONDS: Float = 0f
    }
}

/**
 * The discrete fade-duration cycle a composer tap walks — the Android tap-friendly form of
 * the iOS `0…5 s` slider. One tap advances to the next longer step, wrapping past the
 * longest back to no-fade. Every step stays within the iOS-accepted `0…5 s` range, so a
 * cycled value always round-trips through the wire the reader/exporter honour.
 */
object StoryTextFadeCycle {
    /** The offered durations in seconds, short→long; a tap past the last wraps to [StoryTextFade.NONE_SECONDS]. */
    val steps: List<Float> = listOf(0.5f, 1f, 2f, 3f, 5f)

    /**
     * The duration one tap after [current]: the first [steps] value strictly greater than
     * [current], or [StoryTextFade.NONE_SECONDS] once at or past the longest step (the wrap).
     * A value sitting *between* two steps advances to the next HIGHER step, so a tap always
     * lengthens and never surprises by shortening.
     */
    fun advance(current: Float): Float =
        steps.firstOrNull { it > current } ?: StoryTextFade.NONE_SECONDS
}
