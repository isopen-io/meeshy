package me.meeshy.app.stories

import androidx.compose.runtime.Immutable

/**
 * Segmented count-dots shown under a multi-story tray ring — the Android port of
 * iOS `storyCountDots`, but **richer**: where iOS dims every dot uniformly on a
 * group-level `hasUnviewed` flag, this resolves the *precise* number of unseen
 * stories so the dots read as "how many new" at a glance.
 *
 * Dots cap at [MAX_DOTS]; a group with more flags [hasOverflow] (rendered as a
 * trailing "+"). The trailing [unviewedCount] dots are [isActive] — the unseen
 * stories are the most recent, so activating the tail keeps the indicator honest.
 */
@Immutable
class StoryCountDots internal constructor(
    val dotCount: Int,
    val hasOverflow: Boolean,
    private val activeFromIndex: Int,
) {
    fun isActive(index: Int): Boolean = index in activeFromIndex until dotCount

    companion object {
        const val MAX_DOTS: Int = 5

        /** Returns the dots model, or `null` when there is nothing to indicate (≤ 1 story). */
        fun from(storyCount: Int, unviewedCount: Int): StoryCountDots? {
            if (storyCount <= 1) return null
            val dotCount = storyCount.coerceAtMost(MAX_DOTS)
            val activeCount = unviewedCount.coerceIn(0, dotCount)
            return StoryCountDots(
                dotCount = dotCount,
                hasOverflow = storyCount > MAX_DOTS,
                activeFromIndex = dotCount - activeCount,
            )
        }
    }
}
