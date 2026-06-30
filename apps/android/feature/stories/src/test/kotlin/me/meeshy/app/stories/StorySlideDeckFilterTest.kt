package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryFilter
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for per-slide photo filter selection on the pure deck. A filter
 * (and its strength) belongs to the slide it was set on — switching slides keeps
 * each slide's own look — so the deck owns the set/clear/clamp rules in one place.
 */
@RunWith(JUnit4::class)
class StorySlideDeckFilterTest {

    private fun deckOf(vararg ids: String, selected: String = ids.first()): StorySlideDeck =
        StorySlideDeck(slides = ids.map { StorySlide(id = it) }, selectedId = selected)

    @Test
    fun `a fresh slide carries no filter at full default strength`() {
        val slide = StorySlideDeck.single("a").selectedSlide
        assertThat(slide.filter).isNull()
        assertThat(slide.filterIntensity).isEqualTo(StoryFilterMatrix.DEFAULT_INTENSITY)
    }

    @Test
    fun `setSelectedFilter sets the selected slide's filter only`() {
        val deck = deckOf("a", "b").setSelectedFilter(StoryFilter.VINTAGE)
        assertThat(deck.slides[0].filter).isEqualTo(StoryFilter.VINTAGE)
        assertThat(deck.slides[1].filter).isNull()
    }

    @Test
    fun `setSelectedFilter preserves the selection`() {
        val deck = deckOf("a", "b", selected = "b").setSelectedFilter(StoryFilter.BW)
        assertThat(deck.selectedId).isEqualTo("b")
        assertThat(deck.slides[1].filter).isEqualTo(StoryFilter.BW)
        assertThat(deck.slides[0].filter).isNull()
    }

    @Test
    fun `setSelectedFilter with null clears the filter`() {
        val deck = deckOf("a").setSelectedFilter(StoryFilter.WARM).setSelectedFilter(null)
        assertThat(deck.selectedSlide.filter).isNull()
    }

    @Test
    fun `setSelectedFilter leaves text media and transform untouched`() {
        val base = StorySlideDeck(
            slides = listOf(StorySlide(id = "a", text = "hi", mediaIds = listOf("m1"))),
            selectedId = "a",
        )
        val deck = base.setSelectedFilter(StoryFilter.COOL)
        assertThat(deck.selectedSlide.text).isEqualTo("hi")
        assertThat(deck.selectedSlide.mediaIds).containsExactly("m1")
    }

    @Test
    fun `setSelectedFilterIntensity sets the selected slide's strength`() {
        val deck = deckOf("a").setSelectedFilterIntensity(0.3f)
        assertThat(deck.selectedSlide.filterIntensity).isEqualTo(0.3f)
    }

    @Test
    fun `setSelectedFilterIntensity clamps above one`() {
        val deck = deckOf("a").setSelectedFilterIntensity(2.5f)
        assertThat(deck.selectedSlide.filterIntensity).isEqualTo(1f)
    }

    @Test
    fun `setSelectedFilterIntensity clamps below zero`() {
        val deck = deckOf("a").setSelectedFilterIntensity(-1f)
        assertThat(deck.selectedSlide.filterIntensity).isEqualTo(0f)
    }

    @Test
    fun `setSelectedFilterIntensity touches only the selected slide`() {
        val deck = deckOf("a", "b", selected = "a").setSelectedFilterIntensity(0.2f)
        assertThat(deck.slides[0].filterIntensity).isEqualTo(0.2f)
        assertThat(deck.slides[1].filterIntensity).isEqualTo(StoryFilterMatrix.DEFAULT_INTENSITY)
    }

    @Test
    fun `duplicating a slide carries its filter and strength`() {
        val deck = deckOf("a")
            .setSelectedFilter(StoryFilter.DRAMATIC)
            .setSelectedFilterIntensity(0.6f)
            .duplicate("a", "b")
        assertThat(deck.selectedSlide.id).isEqualTo("b")
        assertThat(deck.selectedSlide.filter).isEqualTo(StoryFilter.DRAMATIC)
        assertThat(deck.selectedSlide.filterIntensity).isEqualTo(0.6f)
    }
}
