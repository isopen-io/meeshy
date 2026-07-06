package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the deck's per-slide text-element **z-order** reducer. The
 * `elements` list order *is* the paint order — index 0 is the back, the last index
 * is the front — so reordering an element within its holding slide restacks it for
 * WYSIWYG playback. Every op is a total function returning the **same instance**
 * when it cannot apply (unknown id, already at the extreme, single element), so the
 * ViewModel/Screen stay glue and the rules live in one unit-tested place.
 */
@RunWith(JUnit4::class)
class StorySlideDeckZOrderTest {

    private fun deckOf(vararg slides: StorySlide, selected: String = slides.first().id): StorySlideDeck =
        StorySlideDeck(slides = slides.toList(), selectedId = selected)

    private fun element(id: String) = StoryTextElement(id = id, text = "t")

    private fun slideWith(id: String, vararg elementIds: String) =
        StorySlide(id = id, elements = elementIds.map { element(it) })

    private fun StorySlideDeck.idsOn(slideId: String): List<String> =
        slides.first { it.id == slideId }.elements.map { it.id }

    // --- TO_FRONT ---

    @Test
    fun `TO_FRONT moves the element to the front keeping the others' order`() {
        val deck = deckOf(slideWith("a", "back", "mid", "front"))

        val after = deck.reorderTextElement("back", StoryZOrder.TO_FRONT)

        assertThat(after.idsOn("a")).containsExactly("mid", "front", "back").inOrder()
    }

    @Test
    fun `TO_FRONT is inert when the element is already at the front`() {
        val deck = deckOf(slideWith("a", "back", "front"))

        val after = deck.reorderTextElement("front", StoryZOrder.TO_FRONT)

        assertThat(after).isSameInstanceAs(deck)
    }

    // --- TO_BACK ---

    @Test
    fun `TO_BACK moves the element to the back keeping the others' order`() {
        val deck = deckOf(slideWith("a", "back", "mid", "front"))

        val after = deck.reorderTextElement("front", StoryZOrder.TO_BACK)

        assertThat(after.idsOn("a")).containsExactly("front", "back", "mid").inOrder()
    }

    @Test
    fun `TO_BACK is inert when the element is already at the back`() {
        val deck = deckOf(slideWith("a", "back", "front"))

        val after = deck.reorderTextElement("back", StoryZOrder.TO_BACK)

        assertThat(after).isSameInstanceAs(deck)
    }

    // --- FORWARD (one step toward the front) ---

    @Test
    fun `FORWARD swaps the element one step toward the front`() {
        val deck = deckOf(slideWith("a", "back", "mid", "front"))

        val after = deck.reorderTextElement("back", StoryZOrder.FORWARD)

        assertThat(after.idsOn("a")).containsExactly("mid", "back", "front").inOrder()
    }

    @Test
    fun `FORWARD is inert when the element is already at the front`() {
        val deck = deckOf(slideWith("a", "back", "front"))

        val after = deck.reorderTextElement("front", StoryZOrder.FORWARD)

        assertThat(after).isSameInstanceAs(deck)
    }

    // --- BACKWARD (one step toward the back) ---

    @Test
    fun `BACKWARD swaps the element one step toward the back`() {
        val deck = deckOf(slideWith("a", "back", "mid", "front"))

        val after = deck.reorderTextElement("front", StoryZOrder.BACKWARD)

        assertThat(after.idsOn("a")).containsExactly("back", "front", "mid").inOrder()
    }

    @Test
    fun `BACKWARD is inert when the element is already at the back`() {
        val deck = deckOf(slideWith("a", "back", "front"))

        val after = deck.reorderTextElement("back", StoryZOrder.BACKWARD)

        assertThat(after).isSameInstanceAs(deck)
    }

    // --- inert cases shared by every op ---

    @Test
    fun `reorder is inert on an unknown id for every op`() {
        val deck = deckOf(slideWith("a", "back", "front"))

        StoryZOrder.entries.forEach { op ->
            assertThat(deck.reorderTextElement("ghost", op)).isSameInstanceAs(deck)
        }
    }

    @Test
    fun `reorder is inert on a single-element slide for every op`() {
        val deck = deckOf(slideWith("a", "only"))

        StoryZOrder.entries.forEach { op ->
            assertThat(deck.reorderTextElement("only", op)).isSameInstanceAs(deck)
        }
    }

    // --- isolation ---

    @Test
    fun `reorder only restacks the holding slide and leaves the others untouched`() {
        val deck = deckOf(
            slideWith("a", "a1", "a2"),
            slideWith("b", "b1", "b2", "b3"),
            selected = "a",
        )

        val after = deck.reorderTextElement("b1", StoryZOrder.TO_FRONT)

        assertThat(after.idsOn("a")).containsExactly("a1", "a2").inOrder()
        assertThat(after.idsOn("b")).containsExactly("b2", "b3", "b1").inOrder()
    }

    @Test
    fun `reorder finds the element on a non-selected slide and preserves the selection`() {
        val deck = deckOf(
            slideWith("a", "a1"),
            slideWith("b", "b1", "b2"),
            selected = "a",
        )

        val after = deck.reorderTextElement("b2", StoryZOrder.TO_BACK)

        assertThat(after.selectedId).isEqualTo("a")
        assertThat(after.idsOn("b")).containsExactly("b2", "b1").inOrder()
    }

    @Test
    fun `reorder preserves the moved element's content, only its stacking changes`() {
        val styled = StoryTextElement(id = "x", text = "hello", color = "FF0000")
        val deck = deckOf(StorySlide(id = "a", elements = listOf(element("y"), styled)))

        val after = deck.reorderTextElement("x", StoryZOrder.TO_BACK)

        assertThat(after.idsOn("a")).containsExactly("x", "y").inOrder()
        assertThat(after.slides.first().elements.first()).isEqualTo(styled)
    }
}
