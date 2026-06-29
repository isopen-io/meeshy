package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the deck's per-slide text-element reducer — add / remove /
 * update / move under the iOS ≤5-per-slide cap, mirroring the media reducer. Each
 * operation is a total function returning the same instance when it cannot apply.
 */
@RunWith(JUnit4::class)
class StorySlideDeckTextElementsTest {

    private fun deckOf(vararg slides: StorySlide, selected: String = slides.first().id): StorySlideDeck =
        StorySlideDeck(slides = slides.toList(), selectedId = selected)

    private fun element(id: String, text: String = "hi", x: Float = 0.5f, y: Float = 0.5f) =
        StoryTextElement(id = id, text = text, x = x, y = y)

    // --- addTextElementToSelected ---

    @Test
    fun `addTextElementToSelected appends to the selected slide only`() {
        val deck = deckOf(StorySlide(id = "a"), StorySlide(id = "b"), selected = "a")
        val after = deck.addTextElementToSelected(element("e1"))
        assertThat(after.slides[0].elements.map { it.id }).containsExactly("e1")
        assertThat(after.slides[1].elements).isEmpty()
    }

    @Test
    fun `addTextElementToSelected clamps an out-of-range position`() {
        val deck = StorySlideDeck.single("a")
        val after = deck.addTextElementToSelected(element("e1", x = -2f, y = 3f))
        val stored = after.selectedSlide.elements.single()
        assertThat(stored.x).isEqualTo(0f)
        assertThat(stored.y).isEqualTo(1f)
    }

    @Test
    fun `addTextElementToSelected is inert on a duplicate id`() {
        val deck = StorySlideDeck.single("a").addTextElementToSelected(element("e1"))
        val again = deck.addTextElementToSelected(element("e1", text = "other"))
        assertThat(again).isSameInstanceAs(deck)
    }

    @Test
    fun `addTextElementToSelected is inert at the per-slide cap`() {
        val full = StorySlide(
            id = "a",
            elements = (1..StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE).map { element("e$it") },
        )
        val deck = deckOf(full)
        assertThat(deck.selectedCanAddTextElement).isFalse()
        assertThat(deck.selectedRemainingTextSlots).isEqualTo(0)
        assertThat(deck.addTextElementToSelected(element("overflow"))).isSameInstanceAs(deck)
    }

    @Test
    fun `selectedRemainingTextSlots counts down from the cap`() {
        val deck = StorySlideDeck.single("a")
        assertThat(deck.selectedRemainingTextSlots).isEqualTo(StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE)
        val after = deck.addTextElementToSelected(element("e1"))
        assertThat(after.selectedRemainingTextSlots).isEqualTo(StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE - 1)
    }

    // --- removeTextElement ---

    @Test
    fun `removeTextElement drops the element from whichever slide holds it`() {
        val deck = deckOf(
            StorySlide(id = "a", elements = listOf(element("e1"))),
            StorySlide(id = "b", elements = listOf(element("e2"))),
            selected = "a",
        )
        val after = deck.removeTextElement("e2")
        assertThat(after.slides[0].elements.map { it.id }).containsExactly("e1")
        assertThat(after.slides[1].elements).isEmpty()
    }

    @Test
    fun `removeTextElement is inert on an unknown id`() {
        val deck = deckOf(StorySlide(id = "a", elements = listOf(element("e1"))))
        assertThat(deck.removeTextElement("z")).isSameInstanceAs(deck)
    }

    // --- updateTextElement ---

    @Test
    fun `updateTextElement rewrites the matching element only`() {
        val deck = deckOf(
            StorySlide(id = "a", elements = listOf(element("e1", text = "old"), element("e2", text = "keep"))),
        )
        val after = deck.updateTextElement("e1") { it.copy(text = "new", style = StoryTextStyle.NEON) }
        val elements = after.selectedSlide.elements
        assertThat(elements.first { it.id == "e1" }.text).isEqualTo("new")
        assertThat(elements.first { it.id == "e1" }.style).isEqualTo(StoryTextStyle.NEON)
        assertThat(elements.first { it.id == "e2" }.text).isEqualTo("keep")
    }

    @Test
    fun `updateTextElement re-clamps a position the transform pushed off-canvas`() {
        val deck = deckOf(StorySlide(id = "a", elements = listOf(element("e1"))))
        val after = deck.updateTextElement("e1") { it.copy(x = 5f, y = -3f) }
        val stored = after.selectedSlide.elements.single()
        assertThat(stored.x).isEqualTo(1f)
        assertThat(stored.y).isEqualTo(0f)
    }

    @Test
    fun `updateTextElement is inert on an unknown id`() {
        val deck = deckOf(StorySlide(id = "a", elements = listOf(element("e1"))))
        assertThat(deck.updateTextElement("z") { it.copy(text = "x") }).isSameInstanceAs(deck)
    }

    // --- moveTextElement ---

    @Test
    fun `moveTextElement translates and clamps`() {
        val deck = deckOf(StorySlide(id = "a", elements = listOf(element("e1", x = 0.9f, y = 0.5f))))
        val after = deck.moveTextElement("e1", dx = 0.5f, dy = -0.2f)
        val stored = after.selectedSlide.elements.single()
        assertThat(stored.x).isEqualTo(1f)
        assertThat(stored.y).isWithin(1e-6f).of(0.3f)
    }

    @Test
    fun `moveTextElement is inert on an unknown id`() {
        val deck = deckOf(StorySlide(id = "a", elements = listOf(element("e1"))))
        assertThat(deck.moveTextElement("z", dx = 0.1f, dy = 0.1f)).isSameInstanceAs(deck)
    }

    // --- transformTextElement ---

    @Test
    fun `transformTextElement pinch-scales and rotates the matching element`() {
        val deck = deckOf(StorySlide(id = "a", elements = listOf(element("e1"))))
        val after = deck.transformTextElement("e1", scaleBy = 2f, rotateByDeg = 30f)
        val stored = after.selectedSlide.elements.single()
        assertThat(stored.scale).isWithin(1e-6f).of(2f)
        assertThat(stored.rotationDeg).isWithin(1e-4f).of(30f)
    }

    @Test
    fun `transformTextElement clamps the scale to the canvas bounds`() {
        val deck = deckOf(StorySlide(id = "a", elements = listOf(element("e1"))))
        val after = deck.transformTextElement("e1", scaleBy = 100f, rotateByDeg = 0f)
        assertThat(after.selectedSlide.elements.single().scale).isEqualTo(StoryTextElement.MAX_SCALE)
    }

    @Test
    fun `transformTextElement touches only the matching element`() {
        val deck = deckOf(
            StorySlide(id = "a", elements = listOf(element("e1"), element("e2"))),
        )
        val after = deck.transformTextElement("e1", scaleBy = 1.5f, rotateByDeg = 10f)
        val others = after.selectedSlide.elements.single { it.id == "e2" }
        assertThat(others.scale).isEqualTo(StoryTextElement.DEFAULT_SCALE)
        assertThat(others.rotationDeg).isEqualTo(StoryTextElement.DEFAULT_ROTATION)
    }

    @Test
    fun `transformTextElement is inert on an unknown id`() {
        val deck = deckOf(StorySlide(id = "a", elements = listOf(element("e1"))))
        assertThat(deck.transformTextElement("z", scaleBy = 2f, rotateByDeg = 10f)).isSameInstanceAs(deck)
    }

    // --- aggregate / publishable rules ---

    @Test
    fun `hasTextElements ignores blank elements`() {
        val blank = deckOf(StorySlide(id = "a", elements = listOf(element("e1", text = "  "))))
        assertThat(blank.hasTextElements).isFalse()
        val real = blank.updateTextElement("e1") { it.copy(text = "Bonjour") }
        assertThat(real.hasTextElements).isTrue()
    }

    @Test
    fun `a slide carrying only a publishable text element is publishable`() {
        val deck = deckOf(
            StorySlide(id = "a", elements = listOf(element("e1", text = "Hello"))),
            StorySlide(id = "b", elements = listOf(element("e2", text = "  "))),
            selected = "a",
        )
        assertThat(deck.publishableSlides.map { it.id }).containsExactly("a")
    }

    @Test
    fun `isWithinTextElementLimit flags an over-cap slide`() {
        val within = deckOf(StorySlide(id = "a", elements = listOf(element("e1"))))
        assertThat(within.isWithinTextElementLimit()).isTrue()
        val over = deckOf(
            StorySlide(id = "a", elements = (1..StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE + 1).map { element("e$it") }),
        )
        assertThat(over.isWithinTextElementLimit()).isFalse()
    }

    @Test
    fun `duplicate carries a slide's text elements into the clone`() {
        val deck = deckOf(StorySlide(id = "a", elements = listOf(element("e1", text = "carry"))))
        val after = deck.duplicate(sourceId = "a", newId = "a2")
        assertThat(after.slides[1].elements.single().text).isEqualTo("carry")
    }
}
