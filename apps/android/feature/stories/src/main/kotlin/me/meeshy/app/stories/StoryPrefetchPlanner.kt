package me.meeshy.app.stories

/**
 * Pure planner deciding which upcoming slide images to warm into the shared
 * image cache so the next slide paints instantly (the Instant-App rule: never
 * show a spinner for media we could have prefetched).
 *
 * Where iOS preloads only the single immediate next item, this warms a window
 * of the next [DEFAULT_LOOKAHEAD] distinct image-bearing slides in viewing
 * order, continuing across author-group boundaries so a group roll-over is also
 * seamless. Text-only slides carry no image and are skipped without consuming a
 * slot. No clock, no IO — the decision is fully testable.
 */
object StoryPrefetchPlanner {

    const val DEFAULT_LOOKAHEAD: Int = 2

    /** The next up-to-[lookahead] distinct image URLs ahead of the current slide, in viewing order. */
    fun plan(playback: StoryPlayback, lookahead: Int = DEFAULT_LOOKAHEAD): List<String> {
        if (playback.isDismissed || lookahead <= 0) return emptyList()
        return upcomingSlides(playback)
            .mapNotNull { it.imageUrl }
            .distinct()
            .take(lookahead)
    }

    /** Slides strictly after the current position, flattened in forward viewing order. */
    private fun upcomingSlides(playback: StoryPlayback): List<StorySlideView> {
        val groups = playback.groups
        val remainingInCurrent = groups.getOrNull(playback.groupIndex)
            ?.slides
            ?.drop(playback.slideIndex + 1)
            .orEmpty()
        val laterGroups = groups.drop(playback.groupIndex + 1).flatMap { it.slides }
        return remainingInCurrent + laterGroups
    }
}
