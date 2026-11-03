package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryItem
import org.junit.Test

class StoryPlaybackEntryLawsTest {

    private fun slide(id: String) = StorySlideView(id = id, text = "", isTranslated = false, imageUrl = null, accentHex = "000000")
    private fun group(id: String, vararg slides: String) = StoryGroupSlides(id, id, slides.map(::slide))
    private val items = mapOf(
        "empty" to StoryItem(id = "empty"),
        "dead" to StoryItem(id = "dead", content = "x", expiresAt = "dead"),
    )

    private fun skip(playback: StoryPlayback) =
        playback.skippingUnplayable("me", { items[it] }) { it.expiresAt == "dead" }

    @Test
    fun `a playable slide is left alone`() {
        val playback = StoryPlayback(listOf(group("a", "a1")))
        assertThat(skip(playback)).isEqualTo(playback)
    }

    @Test
    fun `expired then empty slides are skipped to the first playable one`() {
        val next = skip(StoryPlayback(listOf(group("a", "dead", "empty", "a3"))))
        assertThat(next.slideIndex).isEqualTo(2)
    }

    @Test
    fun `an exhausted group lands on the next group and exhaustion dismisses`() {
        val jump = skip(StoryPlayback(listOf(group("a", "dead"), group("b", "b1"))))
        assertThat(jump.groupIndex).isEqualTo(1)
        assertThat(jump.slideIndex).isEqualTo(0)
        assertThat(skip(StoryPlayback(listOf(group("a", "dead"), group("b", "empty")))).isDismissed).isTrue()
    }

    @Test
    fun `reanchoring keeps the same story when a group is inserted before it`() {
        val playback = StoryPlayback(listOf(group("a", "a1", "a2")), groupIndex = 0, slideIndex = 1)
        val moved = playback.reanchoredOn(listOf(group("z", "z1"), group("a", "a1", "a2")))
        assertThat(moved.currentSlide?.id).isEqualTo("a2")
        assertThat(moved.groupIndex).isEqualTo(1)
    }

    @Test
    fun `reanchoring on nothing dismisses`() {
        assertThat(StoryPlayback(listOf(group("a", "a1"))).reanchoredOn(emptyList()).isDismissed).isTrue()
    }

    @Test
    fun `single group mode drops every other author`() {
        val playback = StoryPlayback(listOf(group("a", "a1"), group("b", "b1")), groupIndex = 1)
        val single = playback.restrictedToCurrentGroup()
        assertThat(single.groups.map { it.userId }).containsExactly("b")
        assertThat(single.groupIndex).isEqualTo(0)
    }
}
