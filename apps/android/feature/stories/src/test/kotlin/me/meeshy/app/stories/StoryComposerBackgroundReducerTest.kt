package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryFilter
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryComposerBackgroundReducerTest {

    private val base = StoryComposerUiState()

    @Test
    fun `the filter applies to the selected slide only`() {
        val filter = StoryFilter.entries.first()

        val after = StoryComposerBackgroundReducer.filterSelected(base, filter)

        assertThat(after.selectedSlideFilter).isEqualTo(filter)
        assertThat(StoryComposerBackgroundReducer.filterSelected(after, null).selectedSlideFilter).isNull()
    }

    @Test
    fun `duration follows the deck pin law`() {
        val after = StoryComposerBackgroundReducer.durationChanged(base, 7.0)

        assertThat(after.deck).isEqualTo(base.deck.setSelectedDuration(7.0))
    }

    @Test
    fun `intensity is clamped by the deck`() {
        val after = StoryComposerBackgroundReducer.filterIntensityChanged(base, 5f)

        assertThat(after.deck).isEqualTo(base.deck.setSelectedFilterIntensity(5f))
    }

    @Test
    fun `background loop on a slide without designated media is inert`() {
        val after = StoryComposerBackgroundReducer.backgroundLoopSet(base, false)

        assertThat(after.deck).isEqualTo(base.deck.setSelectedBackgroundLoop(false))
    }

    @Test
    fun `toggling background media on an unattached id leaves the deck as the deck law decides`() {
        val after = StoryComposerBackgroundReducer.backgroundMediaToggled(base, "m1")

        assertThat(after.deck).isEqualTo(base.deck.toggleSelectedBackgroundMedia("m1"))
    }
}
