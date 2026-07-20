package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behaviour of the cross-group story viewer navigation engine. Pure logic,
 * no clock / IO: every transition returns a new immutable [StoryPlayback].
 * Mirrors the iOS `StoryViewerView` loop (tap-advance rolls groups over,
 * dismisses past the last slide; tap-back rolls to the previous group's last
 * slide and is inert at the very first slide; swipes jump whole groups).
 */
class StoryPlaybackTest {

    private fun slide(id: String) =
        StorySlideView(id = id, text = id, isTranslated = false, imageUrl = null, accentHex = "FF6B6B")

    private fun group(userId: String, vararg slideIds: String) =
        StoryGroupSlides(userId = userId, authorName = "name-$userId", slides = slideIds.map(::slide))

    private fun playback(vararg groups: StoryGroupSlides, startUserId: String? = null) =
        StoryPlayback.startingAt(groups.toList(), startUserId)

    // ---- startingAt ---------------------------------------------------------

    @Test
    fun `startingAt positions at the requested user's group`() {
        val pb = playback(group("a", "a1"), group("b", "b1", "b2"), startUserId = "b")
        assertThat(pb.groupIndex).isEqualTo(1)
        assertThat(pb.slideIndex).isEqualTo(0)
        assertThat(pb.currentSlide?.id).isEqualTo("b1")
        assertThat(pb.authorName).isEqualTo("name-b")
        assertThat(pb.isDismissed).isFalse()
    }

    @Test
    fun `startingAt falls back to the first group when the user is unknown`() {
        val pb = playback(group("a", "a1"), group("b", "b1"), startUserId = "ghost")
        assertThat(pb.groupIndex).isEqualTo(0)
        assertThat(pb.currentSlide?.id).isEqualTo("a1")
    }

    @Test
    fun `startingAt drops groups that have no slides and reindexes the rest`() {
        val pb = playback(group("empty"), group("b", "b1"), startUserId = "b")
        assertThat(pb.groups.map { it.userId }).containsExactly("b")
        assertThat(pb.groupIndex).isEqualTo(0)
        assertThat(pb.currentSlide?.id).isEqualTo("b1")
    }

    @Test
    fun `startingAt with no live groups is immediately dismissed`() {
        val pb = playback(group("empty"), startUserId = null)
        assertThat(pb.groups).isEmpty()
        assertThat(pb.isDismissed).isTrue()
        assertThat(pb.currentSlide).isNull()
        assertThat(pb.authorName).isEmpty()
        assertThat(pb.slides).isEmpty()
    }

    // ---- advance ------------------------------------------------------------

    @Test
    fun `advance walks to the next slide inside the current group`() {
        val pb = playback(group("a", "a1", "a2"), startUserId = "a").advance()
        assertThat(pb.groupIndex).isEqualTo(0)
        assertThat(pb.slideIndex).isEqualTo(1)
        assertThat(pb.currentSlide?.id).isEqualTo("a2")
    }

    @Test
    fun `advance past a group's last slide rolls into the next group`() {
        val pb = playback(group("a", "a1"), group("b", "b1", "b2"), startUserId = "a").advance()
        assertThat(pb.groupIndex).isEqualTo(1)
        assertThat(pb.slideIndex).isEqualTo(0)
        assertThat(pb.currentSlide?.id).isEqualTo("b1")
        assertThat(pb.isDismissed).isFalse()
    }

    @Test
    fun `advance past the last slide of the last group dismisses`() {
        val pb = playback(group("a", "a1"), startUserId = "a").advance()
        assertThat(pb.isDismissed).isTrue()
    }

    @Test
    fun `advance is inert once dismissed`() {
        val dismissed = playback(group("a", "a1"), startUserId = "a").advance()
        assertThat(dismissed.advance()).isEqualTo(dismissed)
    }

    @Test
    fun `advance is inert when there are no groups`() {
        val empty = StoryPlayback(groups = emptyList())
        assertThat(empty.advance()).isEqualTo(empty)
    }

    // ---- back ---------------------------------------------------------------

    @Test
    fun `back walks to the previous slide inside the current group`() {
        val pb = playback(group("a", "a1", "a2"), startUserId = "a").advance().back()
        assertThat(pb.slideIndex).isEqualTo(0)
        assertThat(pb.currentSlide?.id).isEqualTo("a1")
    }

    @Test
    fun `back from a group's first slide rolls to the previous group's last slide`() {
        val pb = playback(group("a", "a1", "a2"), group("b", "b1"), startUserId = "b").back()
        assertThat(pb.groupIndex).isEqualTo(0)
        assertThat(pb.slideIndex).isEqualTo(1)
        assertThat(pb.currentSlide?.id).isEqualTo("a2")
    }

    @Test
    fun `back at the very first slide is a no-op`() {
        val pb = playback(group("a", "a1", "a2"), startUserId = "a")
        assertThat(pb.back()).isEqualTo(pb)
    }

    @Test
    fun `back is inert once dismissed`() {
        val dismissed = playback(group("a", "a1"), startUserId = "a").advance()
        assertThat(dismissed.back()).isEqualTo(dismissed)
    }

    // ---- whole-group jumps (swipes) ----------------------------------------

    @Test
    fun `jumpToNextGroup lands on the next group's first slide`() {
        val pb = playback(group("a", "a1", "a2"), group("b", "b1"), startUserId = "a")
            .advance() // a2
            .jumpToNextGroup()
        assertThat(pb.groupIndex).isEqualTo(1)
        assertThat(pb.slideIndex).isEqualTo(0)
        assertThat(pb.currentSlide?.id).isEqualTo("b1")
    }

    @Test
    fun `jumpToNextGroup past the last group dismisses`() {
        val pb = playback(group("a", "a1"), startUserId = "a").jumpToNextGroup()
        assertThat(pb.isDismissed).isTrue()
    }

    @Test
    fun `jumpToPreviousGroup lands on the previous group's first slide`() {
        val pb = playback(group("a", "a1", "a2"), group("b", "b1"), startUserId = "b")
            .jumpToPreviousGroup()
        assertThat(pb.groupIndex).isEqualTo(0)
        assertThat(pb.slideIndex).isEqualTo(0)
        assertThat(pb.currentSlide?.id).isEqualTo("a1")
    }

    @Test
    fun `jumpToPreviousGroup at the first group restarts the current group`() {
        val pb = playback(group("a", "a1", "a2"), startUserId = "a")
            .advance() // a2
            .jumpToPreviousGroup()
        assertThat(pb.groupIndex).isEqualTo(0)
        assertThat(pb.slideIndex).isEqualTo(0)
        assertThat(pb.currentSlide?.id).isEqualTo("a1")
    }

    @Test
    fun `whole-group jumps are inert once dismissed`() {
        val dismissed = playback(group("a", "a1"), startUserId = "a").advance()
        assertThat(dismissed.jumpToNextGroup()).isEqualTo(dismissed)
        assertThat(dismissed.jumpToPreviousGroup()).isEqualTo(dismissed)
    }

    // ---- dismiss (vertical swipe) ------------------------------------------

    @Test
    fun `dismissed marks a live playback as dismissed without moving position`() {
        val pb = playback(group("a", "a1", "a2"), startUserId = "a").advance()
        val gone = pb.dismissed()
        assertThat(gone.isDismissed).isTrue()
        assertThat(gone.groupIndex).isEqualTo(pb.groupIndex)
        assertThat(gone.slideIndex).isEqualTo(pb.slideIndex)
    }

    @Test
    fun `dismissed is idempotent once already dismissed`() {
        val dismissed = playback(group("a", "a1"), startUserId = "a").advance()
        assertThat(dismissed.isDismissed).isTrue()
        assertThat(dismissed.dismissed()).isEqualTo(dismissed)
    }

    // ---- derived accessors --------------------------------------------------

    @Test
    fun `slides and hasNext-hasPrevious reflect the current group position`() {
        val pb = playback(group("a", "a1", "a2", "a3"), startUserId = "a")
        assertThat(pb.slides.map { it.id }).containsExactly("a1", "a2", "a3").inOrder()
        assertThat(pb.hasPreviousSlide).isFalse()
        assertThat(pb.hasNextSlide).isTrue()
        val mid = pb.advance()
        assertThat(mid.hasPreviousSlide).isTrue()
        assertThat(mid.hasNextSlide).isTrue()
        val last = mid.advance()
        assertThat(last.hasNextSlide).isFalse()
    }
}
