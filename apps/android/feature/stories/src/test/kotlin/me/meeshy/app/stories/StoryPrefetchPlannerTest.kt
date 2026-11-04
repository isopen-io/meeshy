package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behaviour of the pure prefetch planner: which upcoming slide images should be
 * warmed (into the shared Coil cache) so the next slide paints instantly — the
 * Instant-App "no spinner when we could have warmed it" rule. Surpasses iOS,
 * which preloads only the single immediate next item; here a window of the next
 * N image-bearing slides is warmed, continuing across author-group boundaries.
 *
 * Pure logic: no clock, no IO. Driven entirely through the public
 * [StoryPrefetchPlanner.plan] API over [StoryPlayback] fixtures.
 */
class StoryPrefetchPlannerTest {

    private fun slide(id: String, imageUrl: String? = null) =
        StorySlideView(id = id, text = id, isTranslated = false, imageUrl = imageUrl, accentHex = "FF6B6B")

    private fun group(userId: String, vararg slides: StorySlideView) =
        StoryGroupSlides(userId = userId, authorName = "name-$userId", slides = slides.toList())

    private fun playbackAt(groupIndex: Int, slideIndex: Int, vararg groups: StoryGroupSlides) =
        StoryPlayback(groups = groups.toList(), groupIndex = groupIndex, slideIndex = slideIndex)

    @Test
    fun `plan warms the immediate next slide's image`() {
        val pb = playbackAt(
            0, 0,
            group("a", slide("a1", "url://a1"), slide("a2", "url://a2")),
        )
        assertThat(StoryPrefetchPlanner.plan(pb)).containsExactly("url://a2")
    }

    @Test
    fun `plan warms up to the lookahead window of upcoming images in order`() {
        val pb = playbackAt(
            0, 0,
            group("a", slide("a1", "url://a1"), slide("a2", "url://a2"), slide("a3", "url://a3"), slide("a4", "url://a4")),
        )
        assertThat(StoryPrefetchPlanner.plan(pb, lookahead = 2))
            .containsExactly("url://a2", "url://a3").inOrder()
    }

    @Test
    fun `plan continues across the group boundary into the next author`() {
        val pb = playbackAt(
            0, 1,
            group("a", slide("a1", "url://a1"), slide("a2", "url://a2")),
            group("b", slide("b1", "url://b1"), slide("b2", "url://b2")),
        )
        assertThat(StoryPrefetchPlanner.plan(pb, lookahead = 2))
            .containsExactly("url://b1", "url://b2").inOrder()
    }

    @Test
    fun `plan skips text-only slides that have no image`() {
        val pb = playbackAt(
            0, 0,
            group("a", slide("a1", "url://a1"), slide("a2", imageUrl = null), slide("a3", "url://a3")),
        )
        assertThat(StoryPrefetchPlanner.plan(pb, lookahead = 2)).containsExactly("url://a3")
    }

    @Test
    fun `plan dedupes repeated image urls`() {
        val pb = playbackAt(
            0, 0,
            group("a", slide("a1", "url://a1"), slide("a2", "url://same"), slide("a3", "url://same")),
        )
        assertThat(StoryPrefetchPlanner.plan(pb, lookahead = 5)).containsExactly("url://same")
    }

    @Test
    fun `plan is empty at the last slide of the last group`() {
        val pb = playbackAt(
            1, 1,
            group("a", slide("a1", "url://a1")),
            group("b", slide("b1", "url://b1"), slide("b2", "url://b2")),
        )
        assertThat(StoryPrefetchPlanner.plan(pb)).isEmpty()
    }

    @Test
    fun `plan is empty when the playback is dismissed`() {
        val pb = playbackAt(
            0, 0,
            group("a", slide("a1", "url://a1"), slide("a2", "url://a2")),
        ).copy(isDismissed = true)
        assertThat(StoryPrefetchPlanner.plan(pb)).isEmpty()
    }

    @Test
    fun `plan is empty when there are no groups`() {
        assertThat(StoryPrefetchPlanner.plan(StoryPlayback(groups = emptyList()))).isEmpty()
    }

    @Test
    fun `plan is empty for a non-positive lookahead`() {
        val pb = playbackAt(
            0, 0,
            group("a", slide("a1", "url://a1"), slide("a2", "url://a2")),
        )
        assertThat(StoryPrefetchPlanner.plan(pb, lookahead = 0)).isEmpty()
        assertThat(StoryPrefetchPlanner.plan(pb, lookahead = -3)).isEmpty()
    }

    @Test
    fun `plan returns fewer than lookahead when not enough images remain`() {
        val pb = playbackAt(
            0, 0,
            group("a", slide("a1", "url://a1"), slide("a2", "url://a2")),
        )
        assertThat(StoryPrefetchPlanner.plan(pb, lookahead = 5)).containsExactly("url://a2")
    }

    private fun videoSlide(id: String, videoUrl: String) =
        StorySlideView(id = id, text = id, isTranslated = false, imageUrl = null, accentHex = "FF6B6B", backgroundVideoUrl = videoUrl)

    @Test
    fun `the lookahead is the window's two slides ahead`() {
        assertThat(StoryPrefetchPlanner.DEFAULT_LOOKAHEAD).isEqualTo(2)
    }

    @Test
    fun `planVideos warms the upcoming video backgrounds in order and skips image slides`() {
        val pb = playbackAt(
            0, 0,
            group("a", slide("a1", "url://a1"), slide("a2", "url://a2"), videoSlide("a3", "v://a3"), videoSlide("a4", "v://a4"), videoSlide("a5", "v://a5")),
        )
        assertThat(StoryPrefetchPlanner.planVideos(pb)).containsExactly("v://a3", "v://a4").inOrder()
    }

    @Test
    fun `planVideos is empty once dismissed or without lookahead`() {
        val pb = playbackAt(0, 0, group("a", slide("a1"), videoSlide("a2", "v://a2")))
        assertThat(StoryPrefetchPlanner.planVideos(pb, lookahead = 0)).isEmpty()
    }

    @Test
    fun `planBehind keeps the previous slide of the group warm for a back-swipe`() {
        val pb = playbackAt(0, 2, group("a", slide("a1", "url://a1"), videoSlide("a2", "v://a2"), slide("a3", "url://a3")))
        assertThat(StoryPrefetchPlanner.planBehind(pb)).isEqualTo(StoryBehindMedia(imageUrl = null, videoUrl = "v://a2"))
    }

    @Test
    fun `planBehind is empty on the first slide of a group`() {
        val pb = playbackAt(0, 0, group("a", slide("a1", "url://a1"), slide("a2", "url://a2")))
        assertThat(StoryPrefetchPlanner.planBehind(pb)).isEqualTo(StoryBehindMedia())
    }
}
