package me.meeshy.app.stories

/**
 * The discrete base font size of an on-canvas text element — parity with the iOS
 * composer, whose fresh text is born at 96 design units (1080-referential) and whose
 * size the author then changes by pinch. Android keeps the pinch on the separate
 * [StoryTextElement.scale] multiplier and offers, in addition, a discrete size ladder so
 * a size can be chosen by a single tap without a precise pinch.
 *
 * [designSize] is the value that rides onto the wire `StoryTextObject.fontSize`; the
 * effective on-screen size is [designSize] × the element's `scale`, exactly as the iOS
 * renderer composes `fontSize × scale`.
 */
enum class StoryTextSize(val designSize: Float) {
    SMALL(64f),
    MEDIUM(96f),
    LARGE(140f),
    XLARGE(200f),
    ;

    companion object {
        /** The size a fresh element is born at — iOS parity (fresh iOS text is 96 design units). */
        val DEFAULT: StoryTextSize = MEDIUM
    }
}

/**
 * The discrete size cycle the composer's size tap walks. One tap advances to the next
 * larger step and wraps past the largest back to the smallest, mirroring the wrap-around
 * of the style / colour / background cycles. There is no "off" state — text always has a
 * size — so, unlike the outline cycle, no step means "invisible".
 */
object StoryTextSizeCycle {
    /** The offered sizes, smallest→largest: the single ordered SSOT the picker and [next] share. */
    val steps: List<StoryTextSize> = StoryTextSize.entries.toList()

    /** The size one tap after [current]: the next step, wrapping past the last back to the first. */
    fun next(current: StoryTextSize): StoryTextSize {
        val index = steps.indexOf(current)
        return steps[(index + 1) % steps.size]
    }
}
