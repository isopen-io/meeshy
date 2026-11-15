package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryComposerPlacedMediaReducerTest {

    private fun withMedia(vararg ids: String, background: String? = null): StoryComposerUiState {
        val slide = StorySlide(id = "s", mediaIds = ids.toList(), backgroundMediaId = background)
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"))
    }

    private fun StoryComposerUiState.placedMedia() = deck.selectedSlide.placedMedia

    @Test
    fun `the first media placed sits at the centre`() {
        val after = StoryComposerPlacedMediaReducer.placed(withMedia("m1"), "m1")

        assertThat(after.placedMedia()).containsExactly(StoryPlacedMedia("m1", 0.5f, 0.5f, 1f, 0f, zIndex = 1))
    }

    @Test
    fun `a second media does not land on the first`() {
        val one = StoryComposerPlacedMediaReducer.placed(withMedia("m1", "m2"), "m1")

        val two = StoryComposerPlacedMediaReducer.placed(one, "m2")

        val (a, b) = two.placedMedia()
        assertThat(a.x to a.y).isNotEqualTo(b.x to b.y)
    }

    @Test
    fun `placing an unknown media, the background or an already placed media is inert`() {
        val base = withMedia("m1", "bg", background = "bg")
        val placed = StoryComposerPlacedMediaReducer.placed(base, "m1")

        assertThat(StoryComposerPlacedMediaReducer.placed(base, "ghost")).isSameInstanceAs(base)
        assertThat(StoryComposerPlacedMediaReducer.placed(base, "bg")).isSameInstanceAs(base)
        assertThat(StoryComposerPlacedMediaReducer.placed(placed, "m1")).isSameInstanceAs(placed)
    }

    @Test
    fun `moving and transforming rewrite only that media and stay on the canvas`() {
        val base = StoryComposerPlacedMediaReducer.placed(StoryComposerPlacedMediaReducer.placed(withMedia("m1", "m2"), "m1"), "m2")
        val before2 = base.placedMedia().last()

        val moved = StoryComposerPlacedMediaReducer.moved(base, "m1", 9f, -9f)
        val turned = StoryComposerPlacedMediaReducer.transformed(moved, "m1", 2f, 400f)

        val m1 = turned.placedMedia().first { it.mediaId == "m1" }
        assertThat(m1.x).isEqualTo(1f)
        assertThat(m1.y).isEqualTo(0f)
        assertThat(m1.scale).isEqualTo(2f)
        assertThat(m1.rotationDeg).isEqualTo(40f)
        assertThat(turned.placedMedia().last()).isEqualTo(before2)
    }

    @Test
    fun `unplacing keeps the media attached to the slide`() {
        val placed = StoryComposerPlacedMediaReducer.placed(withMedia("m1"), "m1")

        val after = StoryComposerPlacedMediaReducer.unplaced(placed, "m1")

        assertThat(after.placedMedia()).isEmpty()
        assertThat(after.deck.selectedSlide.mediaIds).containsExactly("m1")
        assertThat(StoryComposerPlacedMediaReducer.unplaced(after, "m1")).isSameInstanceAs(after)
    }

    @Test
    fun `toggling places then unplaces`() {
        val on = StoryComposerPlacedMediaReducer.toggled(withMedia("m1"), "m1")
        val off = StoryComposerPlacedMediaReducer.toggled(on, "m1")

        assertThat(on.placedMedia().map { it.mediaId }).containsExactly("m1")
        assertThat(off.placedMedia()).isEmpty()
    }
}
