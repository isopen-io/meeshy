package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryBackgroundValue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for per-slide background authoring on the pure deck. Each slide
 * owns its own author-chosen backdrop ([StorySlide.background]) — the value that
 * serialises to `effects.background` and that the reader honours over its
 * accent→black fallback. The deck owns the set/clear/inert rules so the
 * ViewModel/Screen stay glue; `null` means "no explicit backdrop".
 */
@RunWith(JUnit4::class)
class StorySlideDeckBackgroundTest {

    private fun deckOf(vararg ids: String, selected: String = ids.first()): StorySlideDeck =
        StorySlideDeck(slides = ids.map { StorySlide(id = it) }, selectedId = selected)

    private val teal = StoryBackgroundValue.Hex("08D9D6")
    private val gradient = StoryBackgroundValue.Gradient("FF2E63", "08D9D6")

    @Test
    fun `a fresh slide carries no background`() {
        assertThat(StorySlideDeck.single("a").selectedSlide.background).isNull()
        assertThat(StorySlideDeck.single("a").selectedSlideBackground).isNull()
    }

    @Test
    fun `setSelectedBackground writes the selected slide only`() {
        val deck = deckOf("a", "b", selected = "a").setSelectedBackground(teal)

        assertThat(deck.slides.first { it.id == "a" }.background).isEqualTo(teal)
        assertThat(deck.slides.first { it.id == "b" }.background).isNull()
        assertThat(deck.selectedId).isEqualTo("a")
    }

    @Test
    fun `setSelectedBackground stores a gradient value`() {
        val deck = StorySlideDeck.single("a").setSelectedBackground(gradient)

        assertThat(deck.selectedSlideBackground).isEqualTo(gradient)
    }

    @Test
    fun `setSelectedBackground(null) clears an existing backdrop`() {
        val painted = StorySlideDeck.single("a").setSelectedBackground(teal)

        val cleared = painted.setSelectedBackground(null)

        assertThat(cleared.selectedSlideBackground).isNull()
    }

    @Test
    fun `setSelectedBackground is inert when the value already equals the slide's backdrop`() {
        val painted = StorySlideDeck.single("a").setSelectedBackground(teal)

        assertThat(painted.setSelectedBackground(StoryBackgroundValue.Hex("08D9D6"))).isSameInstanceAs(painted)
    }

    @Test
    fun `clearing an already-blank slide is inert`() {
        val deck = StorySlideDeck.single("a")

        assertThat(deck.setSelectedBackground(null)).isSameInstanceAs(deck)
    }

    @Test
    fun `the background survives a selection change and follows the selected slide`() {
        val deck = deckOf("a", "b", selected = "a")
            .setSelectedBackground(teal)
            .select("b")
            .setSelectedBackground(gradient)

        assertThat(deck.slides.first { it.id == "a" }.background).isEqualTo(teal)
        assertThat(deck.selectedSlideBackground).isEqualTo(gradient)
    }
}
