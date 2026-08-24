package me.meeshy.app.stories

import androidx.compose.runtime.Immutable

/** One author's slides as projected into the viewer. Pure data. */
@Immutable
data class StoryGroupSlides(
    val userId: String,
    val authorName: String,
    val slides: List<StorySlideView>,
)

/**
 * Pure, immutable navigation state for the cross-group story viewer.
 *
 * Mirrors the iOS `StoryViewerView` loop:
 * - [advance] (tap-right / auto-advance) walks the current group's slides,
 *   rolls over to the next group's first slide at the end of a group, and
 *   dismisses once the last slide of the last group is passed.
 * - [back] (tap-left) walks slides in reverse, rolling back to the previous
 *   group's LAST slide, and is a no-op at the very first slide.
 * - [jumpToNextGroup] / [jumpToPreviousGroup] model horizontal swipes.
 *
 * Every transition is pure — it returns a new [StoryPlayback] and never touches
 * the clock or performs IO. [startingAt] drops slide-less groups so that
 * [currentGroup] / [currentSlide] are well-defined for any live playback.
 */
@Immutable
data class StoryPlayback(
    val groups: List<StoryGroupSlides>,
    val groupIndex: Int = 0,
    val slideIndex: Int = 0,
    val isDismissed: Boolean = false,
) {
    val currentGroup: StoryGroupSlides? get() = groups.getOrNull(groupIndex)
    val currentSlide: StorySlideView? get() = currentGroup?.slides?.getOrNull(slideIndex)
    val authorName: String get() = currentGroup?.authorName.orEmpty()
    val slides: List<StorySlideView> get() = currentGroup?.slides.orEmpty()

    val isFirstGroup: Boolean get() = groupIndex <= 0
    val isLastGroup: Boolean get() = groupIndex >= groups.lastIndex
    val hasNextSlide: Boolean get() = slideIndex < slides.lastIndex
    val hasPreviousSlide: Boolean get() = slideIndex > 0

    /** Tap-right / auto-advance: next slide → next group → dismiss at the end. */
    fun advance(): StoryPlayback = when {
        isDismissed || groups.isEmpty() -> this
        hasNextSlide -> copy(slideIndex = slideIndex + 1)
        !isLastGroup -> copy(groupIndex = groupIndex + 1, slideIndex = 0)
        else -> copy(isDismissed = true)
    }

    /** Tap-left: previous slide → previous group's LAST slide → no-op at the start. */
    fun back(): StoryPlayback = when {
        isDismissed || groups.isEmpty() -> this
        hasPreviousSlide -> copy(slideIndex = slideIndex - 1)
        !isFirstGroup -> {
            val previous = groupIndex - 1
            copy(groupIndex = previous, slideIndex = groups[previous].slides.lastIndex.coerceAtLeast(0))
        }
        else -> this
    }

    /** Horizontal swipe →: jump to the next group's first slide, or dismiss past the last. */
    fun jumpToNextGroup(): StoryPlayback = when {
        isDismissed || groups.isEmpty() -> this
        !isLastGroup -> copy(groupIndex = groupIndex + 1, slideIndex = 0)
        else -> copy(isDismissed = true)
    }

    /** Horizontal swipe ←: jump to the previous group's first slide, or restart the first group. */
    fun jumpToPreviousGroup(): StoryPlayback = when {
        isDismissed || groups.isEmpty() -> this
        !isFirstGroup -> copy(groupIndex = groupIndex - 1, slideIndex = 0)
        else -> copy(slideIndex = 0)
    }

    /** Vertical swipe ↓: close the viewer. Position is preserved; idempotent. */
    fun dismissed(): StoryPlayback = if (isDismissed) this else copy(isDismissed = true)

    /**
     * Folds a realtime `story:deleted` for [storyId] into the open viewer: the
     * matched slide is dropped, a group left with no slides is dropped too, and the
     * cursor is re-anchored so the reader keeps watching the SAME content whenever it
     * survives. An id absent from every group is inert (returns `this`).
     *
     * Re-anchoring rules, all derived from identity rather than raw indices so a
     * dropped earlier group shifts the cursor correctly:
     * - the current slide survives → stay on it (its index may shift down);
     * - the current slide was the one removed but its group survives → the slot is
     *   reused, landing on the next slide (or the new last when it was the last);
     * - the current group was emptied → clamp onto the group that now occupies the
     *   slot, at its first slide;
     * - nothing remains → dismiss.
     *
     * Mirror of iOS `StoryViewModel.storyDeleted` (`purgeDeadStories`).
     */
    fun removingSlide(storyId: String): StoryPlayback {
        if (groups.none { group -> group.slides.any { it.id == storyId } }) return this

        val rebuilt = groups.mapNotNull { group ->
            val remaining = group.slides.filterNot { it.id == storyId }
            when {
                remaining.size == group.slides.size -> group
                remaining.isEmpty() -> null
                else -> group.copy(slides = remaining)
            }
        }
        if (rebuilt.isEmpty()) return copy(groups = emptyList(), groupIndex = 0, slideIndex = 0, isDismissed = true)

        val anchorGroupId = currentGroup?.userId
        val anchorSlideId = currentSlide?.id
        val survivedGroupIndex = rebuilt.indexOfFirst { it.userId == anchorGroupId }
        if (survivedGroupIndex >= 0) {
            val survivedGroup = rebuilt[survivedGroupIndex]
            val keptSlideIndex = survivedGroup.slides.indexOfFirst { it.id == anchorSlideId }
            val newSlideIndex =
                if (keptSlideIndex >= 0) keptSlideIndex
                else slideIndex.coerceIn(0, survivedGroup.slides.lastIndex)
            return copy(groups = rebuilt, groupIndex = survivedGroupIndex, slideIndex = newSlideIndex)
        }

        return copy(groups = rebuilt, groupIndex = groupIndex.coerceAtMost(rebuilt.lastIndex), slideIndex = 0)
    }

    companion object {
        /** Build a live playback over the non-empty [groups], positioned at [startUserId]'s group. */
        fun startingAt(groups: List<StoryGroupSlides>, startUserId: String?): StoryPlayback {
            val live = groups.filter { it.slides.isNotEmpty() }
            if (live.isEmpty()) return StoryPlayback(groups = emptyList(), isDismissed = true)
            val start = live.indexOfFirst { it.userId == startUserId }.let { if (it < 0) 0 else it }
            return StoryPlayback(groups = live, groupIndex = start, slideIndex = 0)
        }
    }
}
