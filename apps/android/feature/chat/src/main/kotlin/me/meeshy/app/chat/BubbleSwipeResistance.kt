package me.meeshy.app.chat

import me.meeshy.ui.component.bubble.BubbleGestureReason

/**
 * Pure rules deciding how firmly a bubble's swipe engages (iOS `BubbleSwipeResistance`): a bubble
 * carrying a scrubbable audio or video is [SwipeResistance.Resistant], and the swipe stands down
 * while any widget of the bubble claims the horizontal drag.
 */
internal object BubbleSwipeResistance {

    /** Audio and video bubbles carry a seek bar: their swipe must be forced, not accidental. */
    fun of(hasAudio: Boolean, videoCount: Int): SwipeResistance =
        if (hasAudio || videoCount > 0) SwipeResistance.Resistant else SwipeResistance.Normal

    /** True when any of the live [reasons] owns the horizontal drag (scrubbing, carousel, selection). */
    fun isGestureOwnershipClaimed(reasons: Collection<BubbleGestureReason>): Boolean = reasons.isNotEmpty()

    /** True when a drag `(dx, dy)` should move the row: frankly horizontal and nobody else owns it. */
    fun shouldEngage(dx: Float, dy: Float, resistance: SwipeResistance, claimed: Boolean): Boolean =
        !claimed && SwipeRowLaw.shouldEngage(dx, dy, resistance)
}
