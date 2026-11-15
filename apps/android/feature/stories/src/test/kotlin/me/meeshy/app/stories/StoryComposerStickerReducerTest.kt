package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryComposerStickerReducerTest {

    private fun withSticker(id: String = "s1"): StoryComposerUiState =
        StoryComposerStickerReducer.added(StoryComposerUiState(), "😀", id)

    @Test
    fun `adding a sticker selects it and ends text editing`() {
        val editing = StoryComposerTextReducer.added(StoryComposerUiState(), "t1")

        val after = StoryComposerStickerReducer.added(editing, "😀", "s1")

        assertThat(after.selectedStickerId).isEqualTo("s1")
        assertThat(after.selectedTextElementId).isNull()
        assertThat(after.deck.selectedSlide.stickers.map { it.id }).containsExactly("s1")
    }

    @Test
    fun `a blank emoji is ignored`() {
        val base = StoryComposerUiState()

        assertThat(StoryComposerStickerReducer.added(base, "  ", "s1")).isSameInstanceAs(base)
    }

    @Test
    fun `adding past the cap warns`() {
        val full = (1..StorySlideDeck.MAX_STICKERS_PER_SLIDE).fold(StoryComposerUiState()) { acc, i ->
            StoryComposerStickerReducer.added(acc, "😀", "s$i")
        }

        val after = StoryComposerStickerReducer.added(full, "😀", "extra")

        assertThat(after.errorMessage).isEqualTo(StoryComposerViewModel.STICKER_LIMIT)
        assertThat(after.deck).isEqualTo(full.deck)
    }

    @Test
    fun `selecting an unknown sticker is inert and deselecting nothing keeps the instance`() {
        val base = withSticker()
        val cleared = StoryComposerStickerReducer.deselected(base)

        assertThat(StoryComposerStickerReducer.selected(base, "ghost")).isSameInstanceAs(base)
        assertThat(cleared.selectedStickerId).isNull()
        assertThat(StoryComposerStickerReducer.deselected(cleared)).isSameInstanceAs(cleared)
    }

    @Test
    fun `removing the selected sticker clears the selection`() {
        val after = StoryComposerStickerReducer.removed(withSticker("s1"), "s1")

        assertThat(after.selectedStickerId).isNull()
        assertThat(after.deck.selectedSlide.stickers).isEmpty()
    }

    @Test
    fun `moving and transforming delegate to the deck laws`() {
        val base = withSticker("s1")

        val moved = StoryComposerStickerReducer.moved(base, "s1", 0.1f, 0.0f)
        val scaled = StoryComposerStickerReducer.transformed(base, "s1", 1.5f, 0f)

        assertThat(moved.deck).isEqualTo(base.deck.moveSticker("s1", 0.1f, 0.0f))
        assertThat(scaled.deck).isEqualTo(base.deck.transformSticker("s1", 1.5f, 0f))
    }
}
