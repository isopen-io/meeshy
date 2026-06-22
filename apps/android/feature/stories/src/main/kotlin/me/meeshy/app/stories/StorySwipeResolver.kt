package me.meeshy.app.stories

import kotlin.math.abs

/** The navigation intent a completed drag on the story viewer resolves to. */
enum class StorySwipeAction { NextGroup, PreviousGroup, Dismiss, None }

/**
 * Pure mapping from an accumulated drag to a [StorySwipeAction].
 *
 * Screen coordinates: `+dragX` is right, `+dragY` is down. The dominant axis
 * (greater absolute travel) decides whether the gesture is a horizontal
 * group jump or a vertical dismiss, and only a downward drag dismisses — this
 * mirrors the iOS `StoryViewerView` swipe loop (swipe left = next author,
 * swipe right = previous author, swipe down = close). Travel below the relevant
 * threshold resolves to [StorySwipeAction.None] so a small finger drift during a
 * tap never hijacks navigation.
 *
 * Kept thresholds as parameters (supplied by the Composable from screen density)
 * so the decision stays a pure, fully testable function.
 */
object StorySwipeResolver {
    fun resolve(
        dragX: Float,
        dragY: Float,
        horizontalThreshold: Float,
        verticalThreshold: Float,
    ): StorySwipeAction {
        val horizontalDominant = abs(dragX) > abs(dragY)
        return when {
            horizontalDominant && dragX <= -horizontalThreshold -> StorySwipeAction.NextGroup
            horizontalDominant && dragX >= horizontalThreshold -> StorySwipeAction.PreviousGroup
            !horizontalDominant && dragY >= verticalThreshold -> StorySwipeAction.Dismiss
            else -> StorySwipeAction.None
        }
    }
}
