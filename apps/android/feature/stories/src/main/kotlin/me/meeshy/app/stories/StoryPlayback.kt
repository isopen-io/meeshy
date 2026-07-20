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
