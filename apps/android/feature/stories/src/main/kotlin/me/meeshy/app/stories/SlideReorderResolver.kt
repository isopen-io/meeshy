package me.meeshy.app.stories

import kotlin.math.roundToInt

/**
 * Pure mapping from a horizontal drag on a slide chip to the slot it should land
 * in. The `SlideStrip` Composable accumulates the drag in pixels and supplies the
 * slot width (chip width + inter-chip spacing) from layout/density; the resolver
 * converts that displacement into how many whole slots the chip crossed and clamps
 * the result to the deck's bounds, so the Composable stays glue and feeds the
 * already-tested [StorySlideDeck.move] reducer a deterministic target index.
 *
 * A drag shorter than half a slot rounds to zero (the chip stays put), so a small
 * finger drift never reorders. A non-positive [slotWidthPx] (degenerate or
 * not-yet-measured layout) degrades to the origin rather than dividing by zero.
 */
object SlideReorderResolver {
    fun targetIndex(
        fromIndex: Int,
        dragPx: Float,
        slotWidthPx: Float,
        slideCount: Int,
    ): Int {
        if (slideCount <= 0) return 0
        val lastIndex = slideCount - 1
        val origin = fromIndex.coerceIn(0, lastIndex)
        if (slotWidthPx <= 0f) return origin
        val steps = (dragPx / slotWidthPx).roundToInt()
        return (origin + steps).coerceIn(0, lastIndex)
    }
}
