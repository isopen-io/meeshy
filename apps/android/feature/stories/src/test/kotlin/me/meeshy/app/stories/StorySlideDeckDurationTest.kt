package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryDurationPin
import me.meeshy.sdk.model.StorySlideDuration
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for per-slide duration authoring on the pure deck. Each slide
 * owns its own author-pinned duration ([StorySlide.durationSecondsPin]) — the value
 * that serialises to `effects.timelineDuration` and that the reader honours over
 * content. The deck owns the set/clamp/inert rules, delegating the bound to the
 * single-source [StoryDurationPin] and the content-derived fallback to the
 * single-source [StorySlideDuration], so the ViewModel/Screen stay glue.
 */
@RunWith(JUnit4::class)
class StorySlideDeckDurationTest {

    private fun deckOf(vararg ids: String, selected: String = ids.first()): StorySlideDeck =
        StorySlideDeck(slides = ids.map { StorySlide(id = it) }, selectedId = selected)

    private fun longText(words: Int): StoryTextElement =
        StoryTextElement(id = "t", text = (1..words).joinToString(" ") { "w$it" })

    @Test
    fun `a fresh slide carries no author-pinned duration`() {
        assertThat(StorySlideDeck.single("a").selectedSlide.durationSecondsPin).isNull()
    }

    @Test
    fun `setSelectedDuration pins the selected slide only`() {
        val deck = deckOf("a", "b").setSelectedDuration(8.0)
        assertThat(deck.slides[0].durationSecondsPin).isEqualTo(8.0)
        assertThat(deck.slides[1].durationSecondsPin).isNull()
    }

    @Test
    fun `setSelectedDuration preserves the selection`() {
        val deck = deckOf("a", "b", selected = "b").setSelectedDuration(12.0)
        assertThat(deck.selectedId).isEqualTo("b")
        assertThat(deck.slides[1].durationSecondsPin).isEqualTo(12.0)
        assertThat(deck.slides[0].durationSecondsPin).isNull()
    }

    @Test
    fun `setSelectedDuration clamps a below-floor request up to the minimum`() {
        val deck = deckOf("a").setSelectedDuration(0.5)
        assertThat(deck.selectedSlide.durationSecondsPin).isEqualTo(StoryDurationPin.MIN_SECONDS)
    }

    @Test
    fun `setSelectedDuration clamps an above-ceiling request down to the maximum`() {
        val deck = deckOf("a").setSelectedDuration(10_000.0)
        assertThat(deck.selectedSlide.durationSecondsPin).isEqualTo(StoryDurationPin.MAX_SECONDS)
    }

    @Test
    fun `setSelectedDuration is inert when the clamped value equals the existing pin`() {
        val deck = deckOf("a").setSelectedDuration(8.0)
        val again = deck.setSelectedDuration(8.0)
        assertThat(again).isSameInstanceAs(deck)
    }

    @Test
    fun `setSelectedDuration is inert when a below-floor request equals an existing floor pin`() {
        val deck = deckOf("a").setSelectedDuration(StoryDurationPin.MIN_SECONDS)
        val again = deck.setSelectedDuration(0.1)
        assertThat(again).isSameInstanceAs(deck)
    }

    @Test
    fun `the effective duration defaults to the static baseline with no pin and no content`() {
        assertThat(StorySlideDeck.single("a").selectedSlideDurationSeconds)
            .isEqualTo(StorySlideDuration.DEFAULT_STATIC_SECONDS)
    }

    @Test
    fun `the effective duration follows the content rule when a long caption element is present`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "a", elements = listOf(longText(42)))),
            selectedId = "a",
        )
        val expected = StorySlideDuration.contentDerivedSeconds(
            mediaObjects = null,
            audioPlayerObjects = null,
            textObjects = listOf(longText(42).toTextObject("fr")),
        )
        assertThat(deck.selectedSlideDurationSeconds).isEqualTo(expected)
        assertThat(expected).isGreaterThan(StorySlideDuration.DEFAULT_STATIC_SECONDS)
    }

    @Test
    fun `a blank text element does not extend the effective duration`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "a", elements = listOf(StoryTextElement(id = "t", text = "   ")))),
            selectedId = "a",
        )
        assertThat(deck.selectedSlideDurationSeconds).isEqualTo(StorySlideDuration.DEFAULT_STATIC_SECONDS)
    }

    @Test
    fun `an author pin wins over the content-derived duration`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "a", elements = listOf(longText(42)))),
            selectedId = "a",
        ).setSelectedDuration(3.0)
        assertThat(deck.selectedSlideDurationSeconds).isEqualTo(3.0)
    }
}
