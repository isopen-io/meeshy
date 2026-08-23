package me.meeshy.app.stories

/**
 * The pure, Compose-agnostic outline (stroke) of an on-canvas text element — parity with
 * the iOS text `.border` attribute (`StoryTextObject.borderWidth` / `borderColor`).
 *
 * Held as a flat ([width], [color]) pair rather than a sealed `None`/`Stroke`, precisely
 * because iOS keeps the chosen [color] when the [width] returns to zero, so the user can
 * thicken the stroke again without re-picking a colour: the colour outlives any single
 * zero-width moment, which a `None` case would erase. [width] is in the same point unit the
 * wire `StoryTextObject.borderWidth` uses; [color] is `RRGGBB` (gateway parity, no `#`).
 * A [width] of `0` ([NONE_WIDTH]) means "no stroke".
 */
data class StoryTextOutline(
    val width: Float = NONE_WIDTH,
    val color: String? = null,
) {
    /**
     * True once the stroke is both thick enough to draw ([width] `> 0`) and carries a colour
     * to draw it in: a positive width with no colour paints nothing, and a colour with no
     * width has nothing to paint. The canvas glue reads this to decide whether to stroke.
     */
    val isVisible: Boolean get() = width > NONE_WIDTH && color != null

    companion object {
        /** The at-rest width — no stroke drawn. */
        const val NONE_WIDTH: Float = 0f
    }
}

/**
 * The discrete stroke-thickness cycle the composer's high-row tap walks — parity with the iOS
 * `StoryTextAttributeCycle.advance(.border)`. One tap advances to the next thicker step, wraps
 * past the thickest back to no-stroke, and — the only real coupling — posts the default white
 * the first time a stroke leaves zero with no colour yet, so a stroke is never
 * invisible-because-uncoloured. The chosen colour is preserved across the return to zero,
 * mirroring iOS so re-thickening never asks the user to pick a colour again.
 */
object StoryTextOutlineCycle {
    /** The offered thicknesses, thin→thick; a tap past the last wraps back to [StoryTextOutline.NONE_WIDTH]. */
    val steps: List<Float> = listOf(2f, 4f, 8f, 12f)

    /** The colour posted the first time a stroke leaves zero without one — iOS parity (white). */
    const val DEFAULT_COLOR: String = "FFFFFF"

    /**
     * The outline one tap after [current]: the first [steps] value strictly greater than the
     * current [StoryTextOutline.width], or [StoryTextOutline.NONE_WIDTH] when already at or past
     * the thickest step (the wrap). A width sitting *between* two steps (a value a future fine
     * slider could post, e.g. `5.5`) advances to the next HIGHER step, so a tap always thickens
     * and never surprises by thinning. Leaving zero with no colour posts [DEFAULT_COLOR]; every
     * other transition — including the return to zero — preserves the existing colour.
     */
    fun advance(current: StoryTextOutline): StoryTextOutline {
        val next = steps.firstOrNull { it > current.width } ?: StoryTextOutline.NONE_WIDTH
        val color = if (next > StoryTextOutline.NONE_WIDTH && current.color == null) DEFAULT_COLOR else current.color
        return StoryTextOutline(width = next, color = color)
    }
}
