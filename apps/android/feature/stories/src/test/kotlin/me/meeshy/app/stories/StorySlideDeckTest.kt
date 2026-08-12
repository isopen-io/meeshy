package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure multi-slide composer state. The deck owns the
 * structural rules — add / remove / duplicate / reorder / select with the iOS
 * ≤10-slides cap and the always-≥1-slide invariant — so the future canvas
 * ViewModel/Screen stay glue. No Android, no I/O.
 */
@RunWith(JUnit4::class)
class StorySlideDeckTest {

    private fun deckOf(vararg ids: String, selected: String = ids.first()): StorySlideDeck =
        StorySlideDeck(slides = ids.map { StorySlide(id = it) }, selectedId = selected)

    @Test
    fun `single starts with one selected empty slide`() {
        val deck = StorySlideDeck.single("a")
        assertThat(deck.size).isEqualTo(1)
        assertThat(deck.selectedId).isEqualTo("a")
        assertThat(deck.selectedSlide).isEqualTo(StorySlide(id = "a"))
        assertThat(deck.selectedIndex).isEqualTo(0)
    }

    @Test
    fun `single slide deck can add but cannot remove`() {
        val deck = StorySlideDeck.single("a")
        assertThat(deck.canAddSlide).isTrue()
        assertThat(deck.canRemoveSlide).isFalse()
        assertThat(deck.isFull).isFalse()
    }

    @Test
    fun `empty slides is rejected at construction`() {
        runCatching { StorySlideDeck(slides = emptyList(), selectedId = "a") }
            .also { assertThat(it.isFailure).isTrue() }
    }

    @Test
    fun `selectedId absent from slides is rejected at construction`() {
        runCatching { deckOf("a", "b", selected = "z") }
            .also { assertThat(it.isFailure).isTrue() }
    }

    // --- addSlide ---

    @Test
    fun `addSlide appends a new empty slide and selects it`() {
        val deck = StorySlideDeck.single("a").addSlide("b")
        assertThat(deck.slides.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(deck.selectedId).isEqualTo("b")
        assertThat(deck.slides.last()).isEqualTo(StorySlide(id = "b"))
    }

    @Test
    fun `addSlide is inert at the cap`() {
        val full = StorySlideDeck(
            slides = (1..StorySlideDeck.MAX_SLIDES).map { StorySlide(id = "s$it") },
            selectedId = "s1",
        )
        assertThat(full.isFull).isTrue()
        assertThat(full.canAddSlide).isFalse()
        val after = full.addSlide("overflow")
        assertThat(after).isSameInstanceAs(full)
    }

    @Test
    fun `addSlide with an already-present id is inert`() {
        val deck = deckOf("a", "b")
        assertThat(deck.addSlide("b")).isSameInstanceAs(deck)
    }

    // --- duplicate ---

    @Test
    fun `duplicate clones content into a new slide just after the source and selects it`() {
        val deck = StorySlideDeck(
            slides = listOf(
                StorySlide(id = "a", text = "hello", mediaIds = listOf("m1", "m2")),
                StorySlide(id = "b"),
            ),
            selectedId = "a",
        )
        val after = deck.duplicate(sourceId = "a", newId = "a2")
        assertThat(after.slides.map { it.id }).containsExactly("a", "a2", "b").inOrder()
        assertThat(after.slides[1]).isEqualTo(StorySlide(id = "a2", text = "hello", mediaIds = listOf("m1", "m2")))
        assertThat(after.selectedId).isEqualTo("a2")
    }

    @Test
    fun `duplicate of an unknown source is inert`() {
        val deck = deckOf("a")
        assertThat(deck.duplicate(sourceId = "z", newId = "z2")).isSameInstanceAs(deck)
    }

    @Test
    fun `duplicate is inert at the cap`() {
        val full = StorySlideDeck(
            slides = (1..StorySlideDeck.MAX_SLIDES).map { StorySlide(id = "s$it") },
            selectedId = "s1",
        )
        assertThat(full.duplicate(sourceId = "s1", newId = "s1-copy")).isSameInstanceAs(full)
    }

    @Test
    fun `duplicate with a colliding new id is inert`() {
        val deck = deckOf("a", "b")
        assertThat(deck.duplicate(sourceId = "a", newId = "b")).isSameInstanceAs(deck)
    }

    // --- removeSlide ---

    @Test
    fun `removeSlide drops the slide and keeps a non-removed selection`() {
        val deck = deckOf("a", "b", "c", selected = "a")
        val after = deck.removeSlide("c")
        assertThat(after.slides.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(after.selectedId).isEqualTo("a")
    }

    @Test
    fun `removing the selected slide reselects the slide that takes its place`() {
        val deck = deckOf("a", "b", "c", selected = "b")
        val after = deck.removeSlide("b")
        assertThat(after.slides.map { it.id }).containsExactly("a", "c").inOrder()
        assertThat(after.selectedId).isEqualTo("c")
    }

    @Test
    fun `removing the selected last slide reselects the new last`() {
        val deck = deckOf("a", "b", "c", selected = "c")
        val after = deck.removeSlide("c")
        assertThat(after.slides.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(after.selectedId).isEqualTo("b")
    }

    @Test
    fun `removeSlide is inert with a single slide`() {
        val deck = StorySlideDeck.single("a")
        assertThat(deck.removeSlide("a")).isSameInstanceAs(deck)
    }

    @Test
    fun `removeSlide of an unknown id is inert`() {
        val deck = deckOf("a", "b")
        assertThat(deck.removeSlide("z")).isSameInstanceAs(deck)
    }

    // --- move ---

    @Test
    fun `move reorders the slide and preserves selection by id`() {
        val deck = deckOf("a", "b", "c", selected = "a")
        val after = deck.move("a", toIndex = 2)
        assertThat(after.slides.map { it.id }).containsExactly("b", "c", "a").inOrder()
        assertThat(after.selectedId).isEqualTo("a")
    }

    @Test
    fun `move clamps a negative target index to the front`() {
        val deck = deckOf("a", "b", "c")
        val after = deck.move("c", toIndex = -5)
        assertThat(after.slides.map { it.id }).containsExactly("c", "a", "b").inOrder()
    }

    @Test
    fun `move clamps an out-of-range target index to the back`() {
        val deck = deckOf("a", "b", "c")
        val after = deck.move("a", toIndex = 99)
        assertThat(after.slides.map { it.id }).containsExactly("b", "c", "a").inOrder()
    }

    @Test
    fun `move to the same index is inert`() {
        val deck = deckOf("a", "b", "c")
        assertThat(deck.move("b", toIndex = 1)).isSameInstanceAs(deck)
    }

    @Test
    fun `move of an unknown id is inert`() {
        val deck = deckOf("a", "b")
        assertThat(deck.move("z", toIndex = 0)).isSameInstanceAs(deck)
    }

    // --- select ---

    @Test
    fun `select switches the selection to a present slide`() {
        val deck = deckOf("a", "b", "c", selected = "a")
        assertThat(deck.select("c").selectedId).isEqualTo("c")
    }

    @Test
    fun `select of an unknown id is inert`() {
        val deck = deckOf("a", "b")
        assertThat(deck.select("z")).isSameInstanceAs(deck)
    }

    @Test
    fun `selectedIndex and selectedSlide track the current selection`() {
        val deck = deckOf("a", "b", "c", selected = "b")
        assertThat(deck.selectedIndex).isEqualTo(1)
        assertThat(deck.selectedSlide.id).isEqualTo("b")
    }

    // --- updateSelectedText ---

    @Test
    fun `updateSelectedText rewrites only the selected slide and preserves the rest`() {
        val deck = deckOf("a", "b", "c", selected = "b")
        val after = deck.updateSelectedText("middle")
        assertThat(after.slides.map { it.text }).containsExactly("", "middle", "").inOrder()
        assertThat(after.slides.map { it.id }).containsExactly("a", "b", "c").inOrder()
        assertThat(after.selectedId).isEqualTo("b")
    }

    @Test
    fun `updateSelectedText leaves the selected slide's media untouched`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "a", text = "old", mediaIds = listOf("m1"))),
            selectedId = "a",
        )
        val after = deck.updateSelectedText("new")
        assertThat(after.selectedSlide).isEqualTo(StorySlide(id = "a", text = "new", mediaIds = listOf("m1")))
    }

    // --- updateSelectedTransform ---

    @Test
    fun `updateSelectedTransform rewrites only the selected slide's canvas transform`() {
        val deck = deckOf("a", "b", "c", selected = "b")
        val zoomed = StoryCanvasTransform(scale = 2f, offsetX = 50f, offsetY = -30f)
        val after = deck.updateSelectedTransform(zoomed)
        assertThat(after.slides.map { it.transform })
            .containsExactly(StoryCanvasTransform.IDENTITY, zoomed, StoryCanvasTransform.IDENTITY)
            .inOrder()
        assertThat(after.selectedId).isEqualTo("b")
    }

    @Test
    fun `updateSelectedTransform leaves the selected slide's text and media untouched`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "a", text = "cap", mediaIds = listOf("m1"))),
            selectedId = "a",
        )
        val after = deck.updateSelectedTransform(StoryCanvasTransform(scale = 3f))
        assertThat(after.selectedSlide).isEqualTo(
            StorySlide(id = "a", text = "cap", mediaIds = listOf("m1"), transform = StoryCanvasTransform(scale = 3f)),
        )
    }

    @Test
    fun `duplicate carries the source slide's canvas transform into the clone`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "a", transform = StoryCanvasTransform(scale = 2.5f, offsetX = 12f))),
            selectedId = "a",
        )
        val after = deck.duplicate(sourceId = "a", newId = "a2")
        assertThat(after.slides[1].transform).isEqualTo(StoryCanvasTransform(scale = 2.5f, offsetX = 12f))
    }

    // --- hasText / publishableSlides ---

    @Test
    fun `hasText is false for a deck of blank slides`() {
        assertThat(deckOf("a", "b").hasText).isFalse()
    }

    @Test
    fun `hasText ignores whitespace-only slides`() {
        val deck = StorySlideDeck(slides = listOf(StorySlide(id = "a", text = "   ")), selectedId = "a")
        assertThat(deck.hasText).isFalse()
    }

    @Test
    fun `hasText is true when any slide carries non-blank text`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "a"), StorySlide(id = "b", text = "hi")),
            selectedId = "a",
        )
        assertThat(deck.hasText).isTrue()
    }

    @Test
    fun `publishableSlides keeps only non-blank slides in order`() {
        val deck = StorySlideDeck(
            slides = listOf(
                StorySlide(id = "a", text = "first"),
                StorySlide(id = "b", text = "   "),
                StorySlide(id = "c", text = "third"),
            ),
            selectedId = "a",
        )
        assertThat(deck.publishableSlides.map { it.id }).containsExactly("a", "c").inOrder()
    }

    @Test
    fun `publishableSlides is empty for a deck with neither text nor media`() {
        assertThat(deckOf("a", "b").publishableSlides).isEmpty()
    }

    @Test
    fun `publishableSlides includes a media-only slide that has no text`() {
        val deck = StorySlideDeck(
            slides = listOf(
                StorySlide(id = "a", text = "  "),
                StorySlide(id = "b", mediaIds = listOf("m1")),
            ),
            selectedId = "a",
        )
        assertThat(deck.publishableSlides.map { it.id }).containsExactly("b")
    }

    @Test
    fun `publishableSlides keeps text-and-media slides in order alongside text-only ones`() {
        val deck = StorySlideDeck(
            slides = listOf(
                StorySlide(id = "a", text = "first"),
                StorySlide(id = "b", text = "  ", mediaIds = listOf("m1")),
                StorySlide(id = "c", text = "third", mediaIds = listOf("m2")),
            ),
            selectedId = "a",
        )
        assertThat(deck.publishableSlides.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    // --- addMediaToSelected ---

    @Test
    fun `addMediaToSelected appends to the selected slide and leaves the others untouched`() {
        val deck = deckOf("a", "b", selected = "b")
        val after = deck.addMediaToSelected("m1")
        assertThat(after.slides.first().mediaIds).isEmpty()
        assertThat(after.selectedSlide.mediaIds).containsExactly("m1")
        assertThat(after.selectedId).isEqualTo("b")
    }

    @Test
    fun `addMediaToSelected appends in order so several media accumulate`() {
        val deck = StorySlideDeck.single("a").addMediaToSelected("m1").addMediaToSelected("m2")
        assertThat(deck.selectedSlide.mediaIds).containsExactly("m1", "m2").inOrder()
    }

    @Test
    fun `addMediaToSelected of an already-present id is inert`() {
        val deck = StorySlideDeck.single("a").addMediaToSelected("m1")
        assertThat(deck.addMediaToSelected("m1")).isSameInstanceAs(deck)
    }

    @Test
    fun `addMediaToSelected is inert once the selected slide is at the per-slide media cap`() {
        val full = StorySlideDeck(
            slides = listOf(
                StorySlide(id = "a", mediaIds = (1..StorySlideDeck.MAX_MEDIA_PER_SLIDE).map { "m$it" }),
            ),
            selectedId = "a",
        )
        assertThat(full.selectedSlide.mediaIds).hasSize(StorySlideDeck.MAX_MEDIA_PER_SLIDE)
        assertThat(full.addMediaToSelected("overflow")).isSameInstanceAs(full)
    }

    // --- removeMedia ---

    @Test
    fun `removeMedia drops the id from whichever slide holds it`() {
        val deck = StorySlideDeck(
            slides = listOf(
                StorySlide(id = "a", mediaIds = listOf("m1", "m2")),
                StorySlide(id = "b", mediaIds = listOf("m3")),
            ),
            selectedId = "a",
        )
        val after = deck.removeMedia("m3")
        assertThat(after.slides.first().mediaIds).containsExactly("m1", "m2").inOrder()
        assertThat(after.slides[1].mediaIds).isEmpty()
        assertThat(after.selectedId).isEqualTo("a")
    }

    @Test
    fun `removeMedia of an unknown id is inert`() {
        val deck = StorySlideDeck.single("a").addMediaToSelected("m1")
        assertThat(deck.removeMedia("nope")).isSameInstanceAs(deck)
    }

    // --- hasMedia / isWithinMediaLimit / selectedRemainingMediaSlots ---

    @Test
    fun `hasMedia is false for a deck with no attached media`() {
        assertThat(deckOf("a", "b").hasMedia).isFalse()
    }

    @Test
    fun `hasMedia is true when any slide carries media`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "a"), StorySlide(id = "b", mediaIds = listOf("m1"))),
            selectedId = "a",
        )
        assertThat(deck.hasMedia).isTrue()
    }

    @Test
    fun `isWithinMediaLimit is true when every slide is within the per-slide cap`() {
        val deck = StorySlideDeck(
            slides = listOf(
                StorySlide(id = "a", mediaIds = (1..StorySlideDeck.MAX_MEDIA_PER_SLIDE).map { "m$it" }),
                StorySlide(id = "b", mediaIds = listOf("x")),
            ),
            selectedId = "a",
        )
        assertThat(deck.isWithinMediaLimit()).isTrue()
    }

    @Test
    fun `isWithinMediaLimit is false when any slide exceeds the per-slide cap`() {
        val deck = StorySlideDeck(
            slides = listOf(
                StorySlide(id = "a", mediaIds = (0..StorySlideDeck.MAX_MEDIA_PER_SLIDE).map { "m$it" }),
            ),
            selectedId = "a",
        )
        assertThat(deck.isWithinMediaLimit()).isFalse()
    }

    @Test
    fun `selectedRemainingMediaSlots reflects free slots on the selected slide and never goes negative`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "a", mediaIds = listOf("m1", "m2"))),
            selectedId = "a",
        )
        assertThat(deck.selectedRemainingMediaSlots).isEqualTo(StorySlideDeck.MAX_MEDIA_PER_SLIDE - 2)

        val over = StorySlideDeck(
            slides = listOf(StorySlide(id = "a", mediaIds = (0..StorySlideDeck.MAX_MEDIA_PER_SLIDE).map { "m$it" })),
            selectedId = "a",
        )
        assertThat(over.selectedRemainingMediaSlots).isEqualTo(0)
    }

    // --- isWithinTextLimit ---

    @Test
    fun `isWithinTextLimit is true when every slide is within the cap`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "a", text = "abc"), StorySlide(id = "b", text = "de")),
            selectedId = "a",
        )
        assertThat(deck.isWithinTextLimit(3)).isTrue()
    }

    @Test
    fun `isWithinTextLimit is false when any slide exceeds the cap`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "a", text = "ok"), StorySlide(id = "b", text = "toolong")),
            selectedId = "a",
        )
        assertThat(deck.isWithinTextLimit(3)).isFalse()
    }

    @Test
    fun `isWithinTextLimit counts raw length including surrounding whitespace`() {
        val deck = StorySlideDeck(slides = listOf(StorySlide(id = "a", text = "ab ")), selectedId = "a")
        assertThat(deck.isWithinTextLimit(2)).isFalse()
        assertThat(deck.isWithinTextLimit(3)).isTrue()
    }
}
