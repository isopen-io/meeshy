package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the unified per-element long-press **context menu** resolver.
 * The menu consolidates edit / duplicate / reorder (four z-order ops) / delete for the
 * text element being edited on the composer's SELECTED slide. The core promise is that
 * every item's `enabled` flag is exactly the outcome of the matching deck reducer — a
 * reorder item is enabled iff [StorySlideDeck.reorderTextElement] would actually restack,
 * and DUPLICATE iff [StorySlideDeck.duplicateTextElement] would actually add — so a
 * greyed-out row can never dispatch an inert op, and the rules live in one place.
 */
@RunWith(JUnit4::class)
class StoryElementMenuTest {

    private fun deckOf(vararg slides: StorySlide, selected: String = slides.first().id): StorySlideDeck =
        StorySlideDeck(slides = slides.toList(), selectedId = selected)

    private fun element(id: String) = StoryTextElement(id = id, text = "t")

    private fun slideWith(id: String, vararg elementIds: String) =
        StorySlide(id = id, elements = elementIds.map { element(it) })

    private val reorderActions = listOf(
        StoryElementAction.SEND_TO_BACK,
        StoryElementAction.MOVE_BACKWARD,
        StoryElementAction.MOVE_FORWARD,
        StoryElementAction.BRING_TO_FRONT,
    )

    // --- presence gate ---

    @Test
    fun `resolve returns null for an id absent from the selected slide`() {
        val deck = deckOf(slideWith("a", "e1", "e2"))

        assertThat(StoryElementMenu.resolve(deck, "ghost")).isNull()
    }

    @Test
    fun `resolve only menus the selected slide, ignoring an element on another slide`() {
        val deck = deckOf(
            slideWith("a", "a1"),
            slideWith("b", "b1", "b2"),
            selected = "a",
        )

        // "b2" is real, but on the non-selected slide — the composer never menus it.
        assertThat(StoryElementMenu.resolve(deck, "b2")).isNull()
    }

    @Test
    fun `resolve exposes exactly the seven actions in menu order`() {
        val deck = deckOf(slideWith("a", "e1", "e2"))

        val menu = StoryElementMenu.resolve(deck, "e2")!!

        assertThat(menu.elementId).isEqualTo("e2")
        assertThat(menu.items.map { it.action }).containsExactly(
            StoryElementAction.EDIT,
            StoryElementAction.DUPLICATE,
            StoryElementAction.SEND_TO_BACK,
            StoryElementAction.MOVE_BACKWARD,
            StoryElementAction.MOVE_FORWARD,
            StoryElementAction.BRING_TO_FRONT,
            StoryElementAction.DELETE,
        ).inOrder()
    }

    // --- edit / delete are always available on a present element ---

    @Test
    fun `EDIT and DELETE are enabled for any present element`() {
        val single = deckOf(slideWith("a", "only"))
        val middleDeck = deckOf(slideWith("a", "back", "mid", "front"))

        listOf(single to "only", middleDeck to "mid").forEach { (deck, id) ->
            val menu = StoryElementMenu.resolve(deck, id)!!
            assertThat(menu.isEnabled(StoryElementAction.EDIT)).isTrue()
            assertThat(menu.isEnabled(StoryElementAction.DELETE)).isTrue()
        }
    }

    // --- reorder enablement matches the real reducer, position by position ---

    @Test
    fun `a middle element enables every reorder direction`() {
        val deck = deckOf(slideWith("a", "back", "mid", "front"))

        val menu = StoryElementMenu.resolve(deck, "mid")!!

        reorderActions.forEach { assertThat(menu.isEnabled(it)).isTrue() }
    }

    @Test
    fun `the back element disables both backward directions and enables both forward`() {
        val deck = deckOf(slideWith("a", "back", "mid", "front"))

        val menu = StoryElementMenu.resolve(deck, "back")!!

        assertThat(menu.isEnabled(StoryElementAction.SEND_TO_BACK)).isFalse()
        assertThat(menu.isEnabled(StoryElementAction.MOVE_BACKWARD)).isFalse()
        assertThat(menu.isEnabled(StoryElementAction.MOVE_FORWARD)).isTrue()
        assertThat(menu.isEnabled(StoryElementAction.BRING_TO_FRONT)).isTrue()
    }

    @Test
    fun `the front element disables both forward directions and enables both backward`() {
        val deck = deckOf(slideWith("a", "back", "mid", "front"))

        val menu = StoryElementMenu.resolve(deck, "front")!!

        assertThat(menu.isEnabled(StoryElementAction.SEND_TO_BACK)).isTrue()
        assertThat(menu.isEnabled(StoryElementAction.MOVE_BACKWARD)).isTrue()
        assertThat(menu.isEnabled(StoryElementAction.MOVE_FORWARD)).isFalse()
        assertThat(menu.isEnabled(StoryElementAction.BRING_TO_FRONT)).isFalse()
    }

    @Test
    fun `a single-element slide disables every reorder direction`() {
        val deck = deckOf(slideWith("a", "only"))

        val menu = StoryElementMenu.resolve(deck, "only")!!

        reorderActions.forEach { assertThat(menu.isEnabled(it)).isFalse() }
    }

    @Test
    fun `every reorder item's enabled flag equals whether the deck reducer would restack`() {
        // The core promise: a menu row is enabled exactly when its op is NOT inert.
        val deck = deckOf(slideWith("a", "back", "mid", "front"))

        listOf("back", "mid", "front").forEach { id ->
            val menu = StoryElementMenu.resolve(deck, id)!!
            reorderActions.forEach { action ->
                val op = action.zOrder!!
                val restacks = deck.reorderTextElement(id, op) !== deck
                assertThat(menu.isEnabled(action)).isEqualTo(restacks)
            }
        }
    }

    // --- duplicate enablement matches the real reducer at and below the cap ---

    @Test
    fun `DUPLICATE is enabled below the per-slide text-element cap`() {
        val deck = deckOf(slideWith("a", "e1", "e2"))

        assertThat(StoryElementMenu.resolve(deck, "e1")!!.isEnabled(StoryElementAction.DUPLICATE)).isTrue()
    }

    @Test
    fun `DUPLICATE is disabled once the slide is at the per-slide cap`() {
        val ids = (1..StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE).map { "e$it" }
        val deck = deckOf(StorySlide(id = "a", elements = ids.map { element(it) }))

        assertThat(StoryElementMenu.resolve(deck, "e1")!!.isEnabled(StoryElementAction.DUPLICATE)).isFalse()
    }

    @Test
    fun `DUPLICATE enabled flag equals whether the deck reducer would clone`() {
        val below = deckOf(slideWith("a", "e1", "e2"))
        val atCap = deckOf(
            StorySlide(
                id = "a",
                elements = (1..StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE).map { element("e$it") },
            ),
        )

        listOf(below, atCap).forEach { deck ->
            val menu = StoryElementMenu.resolve(deck, "e1")!!
            val clones = deck.duplicateTextElement("e1", "fresh", 0f, 0f) !== deck
            assertThat(menu.isEnabled(StoryElementAction.DUPLICATE)).isEqualTo(clones)
        }
    }

    // --- the z-order projection used by the wiring ---

    @Test
    fun `zOrder maps each reorder action to its deck op and nothing else`() {
        assertThat(StoryElementAction.SEND_TO_BACK.zOrder).isEqualTo(StoryZOrder.TO_BACK)
        assertThat(StoryElementAction.MOVE_BACKWARD.zOrder).isEqualTo(StoryZOrder.BACKWARD)
        assertThat(StoryElementAction.MOVE_FORWARD.zOrder).isEqualTo(StoryZOrder.FORWARD)
        assertThat(StoryElementAction.BRING_TO_FRONT.zOrder).isEqualTo(StoryZOrder.TO_FRONT)
        assertThat(StoryElementAction.EDIT.zOrder).isNull()
        assertThat(StoryElementAction.DUPLICATE.zOrder).isNull()
        assertThat(StoryElementAction.DELETE.zOrder).isNull()
    }

    @Test
    fun `isEnabled is false for an action absent from the menu items`() {
        // A hand-built menu missing a row must report that row disabled, never crash.
        val menu = StoryElementContextMenu(
            elementId = "x",
            items = listOf(StoryElementMenuItem(StoryElementAction.EDIT, enabled = true)),
        )

        assertThat(menu.isEnabled(StoryElementAction.DELETE)).isFalse()
    }
}
