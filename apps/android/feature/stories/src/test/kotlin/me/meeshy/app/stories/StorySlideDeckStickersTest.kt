package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the deck's per-slide sticker reducer — add / remove / update /
 * move / transform under the [StorySlideDeck.MAX_STICKERS_PER_SLIDE] cap, mirroring the
 * text-element reducer. Each operation is a total function returning the same instance
 * when it cannot apply, so the ViewModel/Screen stay glue.
 */
@RunWith(JUnit4::class)
class StorySlideDeckStickersTest {

    private fun deckOf(vararg slides: StorySlide, selected: String = slides.first().id): StorySlideDeck =
        StorySlideDeck(slides = slides.toList(), selectedId = selected)

    private fun sticker(id: String, emoji: String = "😀", x: Float = 0.5f, y: Float = 0.5f) =
        StoryStickerElement(id = id, emoji = emoji, x = x, y = y)

    // --- addStickerToSelected ---

    @Test
    fun `addStickerToSelected appends to the selected slide only`() {
        val deck = deckOf(StorySlide(id = "a"), StorySlide(id = "b"), selected = "a")
        val after = deck.addStickerToSelected(sticker("s1"))
        assertThat(after.slides[0].stickers.map { it.id }).containsExactly("s1")
        assertThat(after.slides[1].stickers).isEmpty()
    }

    @Test
    fun `addStickerToSelected clamps an out-of-range position`() {
        val after = StorySlideDeck.single("a").addStickerToSelected(sticker("s1", x = -2f, y = 3f))
        val stored = after.selectedSlide.stickers.single()
        assertThat(stored.x).isEqualTo(0f)
        assertThat(stored.y).isEqualTo(1f)
    }

    @Test
    fun `addStickerToSelected preserves the selection`() {
        val deck = deckOf(StorySlide(id = "a"), StorySlide(id = "b"), selected = "b")
        val after = deck.addStickerToSelected(sticker("s1"))
        assertThat(after.selectedId).isEqualTo("b")
        assertThat(after.slides[1].stickers.map { it.id }).containsExactly("s1")
    }

    @Test
    fun `addStickerToSelected is inert on a duplicate id`() {
        val deck = StorySlideDeck.single("a").addStickerToSelected(sticker("s1"))
        val again = deck.addStickerToSelected(sticker("s1", emoji = "🎉"))
        assertThat(again).isSameInstanceAs(deck)
    }

    @Test
    fun `addStickerToSelected is inert at the per-slide cap`() {
        val full = StorySlide(
            id = "a",
            stickers = (1..StorySlideDeck.MAX_STICKERS_PER_SLIDE).map { sticker("s$it") },
        )
        val deck = deckOf(full)
        assertThat(deck.selectedCanAddSticker).isFalse()
        assertThat(deck.selectedRemainingStickerSlots).isEqualTo(0)
        assertThat(deck.addStickerToSelected(sticker("overflow"))).isSameInstanceAs(deck)
    }

    @Test
    fun `selectedRemainingStickerSlots counts the free slots`() {
        val deck = StorySlideDeck.single("a").addStickerToSelected(sticker("s1"))
        assertThat(deck.selectedRemainingStickerSlots)
            .isEqualTo(StorySlideDeck.MAX_STICKERS_PER_SLIDE - 1)
        assertThat(deck.selectedCanAddSticker).isTrue()
    }

    // --- removeSticker ---

    @Test
    fun `removeSticker removes from whichever slide holds it`() {
        val deck = deckOf(
            StorySlide(id = "a", stickers = listOf(sticker("s1"), sticker("s2"))),
            StorySlide(id = "b", stickers = listOf(sticker("s3"))),
            selected = "b",
        )
        val after = deck.removeSticker("s1")
        assertThat(after.slides[0].stickers.map { it.id }).containsExactly("s2")
        assertThat(after.slides[1].stickers.map { it.id }).containsExactly("s3")
        assertThat(after.selectedId).isEqualTo("b")
    }

    @Test
    fun `removeSticker is inert on an unknown id`() {
        val deck = StorySlideDeck.single("a").addStickerToSelected(sticker("s1"))
        assertThat(deck.removeSticker("nope")).isSameInstanceAs(deck)
    }

    // --- updateSticker ---

    @Test
    fun `updateSticker rewrites and re-normalises only the matching sticker`() {
        val deck = deckOf(StorySlide(id = "a", stickers = listOf(sticker("s1"), sticker("s2"))))
        val after = deck.updateSticker("s1") { it.copy(emoji = "🎉", x = 5f) }
        val updated = after.selectedSlide.stickers.first { it.id == "s1" }
        assertThat(updated.emoji).isEqualTo("🎉")
        assertThat(updated.x).isEqualTo(1f) // re-clamped
        assertThat(after.selectedSlide.stickers.first { it.id == "s2" }.emoji).isEqualTo("😀")
    }

    @Test
    fun `updateSticker is inert on an unknown id`() {
        val deck = StorySlideDeck.single("a").addStickerToSelected(sticker("s1"))
        assertThat(deck.updateSticker("nope") { it.copy(emoji = "x") }).isSameInstanceAs(deck)
    }

    // --- moveSticker ---

    @Test
    fun `moveSticker nudges and clamps the sticker`() {
        val deck = StorySlideDeck.single("a").addStickerToSelected(sticker("s1", x = 0.9f, y = 0.1f))
        val after = deck.moveSticker("s1", dx = 0.5f, dy = -0.5f)
        val moved = after.selectedSlide.stickers.single()
        assertThat(moved.x).isEqualTo(1f)
        assertThat(moved.y).isEqualTo(0f)
    }

    @Test
    fun `moveSticker is inert on an unknown id`() {
        val deck = StorySlideDeck.single("a").addStickerToSelected(sticker("s1"))
        assertThat(deck.moveSticker("nope", 0.1f, 0.1f)).isSameInstanceAs(deck)
    }

    // --- transformSticker ---

    @Test
    fun `transformSticker scales and rotates the matching sticker`() {
        val deck = StorySlideDeck.single("a").addStickerToSelected(sticker("s1"))
        val after = deck.transformSticker("s1", scaleBy = 2f, rotateByDeg = 30f)
        val t = after.selectedSlide.stickers.single()
        assertThat(t.scale).isEqualTo(2f)
        assertThat(t.rotationDeg).isEqualTo(30f)
    }

    @Test
    fun `transformSticker clamps an extreme pinch`() {
        val deck = StorySlideDeck.single("a").addStickerToSelected(sticker("s1"))
        val after = deck.transformSticker("s1", scaleBy = 99f, rotateByDeg = 0f)
        assertThat(after.selectedSlide.stickers.single().scale).isEqualTo(StoryTextElement.MAX_SCALE)
    }

    @Test
    fun `transformSticker touches only the matching sticker`() {
        val deck = deckOf(StorySlide(id = "a", stickers = listOf(sticker("s1"), sticker("s2"))))
        val after = deck.transformSticker("s1", scaleBy = 2f, rotateByDeg = 0f)
        assertThat(after.selectedSlide.stickers.first { it.id == "s2" }.scale).isEqualTo(1f)
    }

    @Test
    fun `transformSticker is inert on an unknown id`() {
        val deck = StorySlideDeck.single("a").addStickerToSelected(sticker("s1"))
        assertThat(deck.transformSticker("nope", 2f, 0f)).isSameInstanceAs(deck)
    }

    // --- limits / publishability ---

    @Test
    fun `isWithinStickerLimit holds at the cap and fails past it`() {
        val atCap = deckOf(
            StorySlide(id = "a", stickers = (1..StorySlideDeck.MAX_STICKERS_PER_SLIDE).map { sticker("s$it") }),
        )
        assertThat(atCap.isWithinStickerLimit()).isTrue()
        val over = deckOf(
            StorySlide(id = "a", stickers = (0..StorySlideDeck.MAX_STICKERS_PER_SLIDE).map { sticker("s$it") }),
        )
        assertThat(over.isWithinStickerLimit()).isFalse()
    }

    @Test
    fun `hasStickers is true only when a publishable sticker exists`() {
        assertThat(StorySlideDeck.single("a").hasStickers).isFalse()
        val blank = deckOf(StorySlide(id = "a", stickers = listOf(sticker("s1", emoji = "  "))))
        assertThat(blank.hasStickers).isFalse()
        val real = deckOf(StorySlide(id = "a", stickers = listOf(sticker("s1", emoji = "😀"))))
        assertThat(real.hasStickers).isTrue()
    }

    @Test
    fun `a sticker-only slide is publishable`() {
        val deck = deckOf(StorySlide(id = "a", stickers = listOf(sticker("s1", emoji = "🎉"))))
        assertThat(deck.publishableSlides.map { it.id }).containsExactly("a")
    }

    @Test
    fun `a slide with only a blank sticker is not publishable`() {
        val deck = deckOf(StorySlide(id = "a", stickers = listOf(sticker("s1", emoji = "   "))))
        assertThat(deck.publishableSlides).isEmpty()
    }
}
