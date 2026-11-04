package me.meeshy.app.stories

import me.meeshy.sdk.model.scene.StoryReaderWindow
import me.meeshy.sdk.model.story.StoryGroupShape
import me.meeshy.sdk.model.story.StoryNavigationDirection
import me.meeshy.sdk.model.story.StoryNeighborWindow
import me.meeshy.sdk.model.story.StorySlidePosition

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

    const val DEFAULT_LOOKAHEAD: Int = StoryReaderWindow.AHEAD

    /** The next up-to-[lookahead] distinct image URLs ahead of the current slide, in viewing order. */
    fun plan(playback: StoryPlayback, lookahead: Int = DEFAULT_LOOKAHEAD): List<String> {
        if (playback.isDismissed || lookahead <= 0) return emptyList()
        return upcomingSlides(playback)
            .mapNotNull { it.imageUrl }
            .distinct()
            .take(lookahead)
    }

    /**
     * The video backgrounds to prepare (paused) for the upcoming slides, same window and order as [plan] — a video
     * slide must not wait for a player to be created when the viewer lands on it.
     */
    fun planVideos(playback: StoryPlayback, lookahead: Int = DEFAULT_LOOKAHEAD): List<String> {
        if (playback.isDismissed || lookahead <= 0) return emptyList()
        return upcomingSlides(playback)
            .mapNotNull { it.backgroundVideoUrl }
            .distinct()
            .take(lookahead)
    }

    /** The slide just BEHIND the current one (the back-swipe side of the `[N-1, N, N+1, N+2]` window): its image and video. */
    fun planBehind(playback: StoryPlayback): StoryBehindMedia {
        if (playback.isDismissed) return StoryBehindMedia()
        val previous = playback.groups.getOrNull(playback.groupIndex)?.slides?.getOrNull(playback.slideIndex - StoryReaderWindow.BEHIND)
        return StoryBehindMedia(imageUrl = previous?.imageUrl, videoUrl = previous?.backgroundVideoUrl)
    }

    /**
     * Le plan complet de voisinage (iOS `StoryNeighborWindow`) : anneau N±2 puis reste du groupe et groupes
     * voisins, la voisine du sens du geste d'abord. Images (affiches comprises) et audios pour tout le voisinage,
     * vidéos pour N±1 seulement (le pool de lecteurs en tient deux).
     */
    fun planWindow(playback: StoryPlayback, direction: StoryNavigationDirection): StoryPrefetchPlan {
        if (playback.isDismissed) return StoryPrefetchPlan()
        val shapes = playback.groups.map { StoryGroupShape(slideCount = it.slides.size, entryIndex = 0) }
        val preparations = StoryNeighborWindow.preparations(StorySlidePosition(playback.groupIndex, playback.slideIndex), shapes, direction)
        val ordered = preparations.mapNotNull { prep ->
            playback.groups.getOrNull(prep.position.group)?.slides?.getOrNull(prep.position.slide)?.let { it to prep.distance }
        }
        return StoryPrefetchPlan(
            images = ordered.flatMap { (slide, _) -> listOfNotNull(slide.imageUrl, slide.backgroundPosterUrl) }.distinct(),
            videos = ordered.filter { it.second == 1 }.mapNotNull { it.first.backgroundVideoUrl }.distinct().take(MAX_PREPARED_VIDEOS),
            audios = ordered.flatMap { (slide, _) -> listOfNotNull(slide.backgroundAudioUrl, slide.foregroundAudioUrl) }.distinct(),
        )
    }

    const val MAX_PREPARED_VIDEOS: Int = 2

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

/** The media of the slide behind the current one, to keep warm for a back-swipe. */
data class StoryBehindMedia(val imageUrl: String? = null, val videoUrl: String? = null)

/** Ce que le voisinage demande de chauffer, dans l'ordre de priorité. */
data class StoryPrefetchPlan(
    val images: List<String> = emptyList(),
    val videos: List<String> = emptyList(),
    val audios: List<String> = emptyList(),
)

/** Retient la position précédente pour lire le sens du geste ; sans déplacement, le sens précédent tient. */
class StoryPrefetchDirectionTracker {
    private var previous: StorySlidePosition? = null
    private var direction: StoryNavigationDirection = StoryNavigationDirection.FORWARD

    fun observe(playback: StoryPlayback): StoryNavigationDirection {
        val current = StorySlidePosition(playback.groupIndex, playback.slideIndex)
        direction = StoryNeighborWindow.direction(previous, current, direction)
        previous = current
        return direction
    }
}
