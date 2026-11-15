package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Les bords (30 % chacun) naviguent, la bande centrale est au double toucher — iOS `StoryTapZone`. */
class StoryTapZoneTest {

    @Test
    fun `the outer thirds navigate and the middle band belongs to the double tap`() {
        assertThat(StoryTapZone.of(x = 0f, width = 1000f)).isEqualTo(StoryTapZone.Previous)
        assertThat(StoryTapZone.of(x = 299f, width = 1000f)).isEqualTo(StoryTapZone.Previous)
        assertThat(StoryTapZone.of(x = 300f, width = 1000f)).isEqualTo(StoryTapZone.Center)
        assertThat(StoryTapZone.of(x = 699f, width = 1000f)).isEqualTo(StoryTapZone.Center)
        assertThat(StoryTapZone.of(x = 700f, width = 1000f)).isEqualTo(StoryTapZone.Next)
        assertThat(StoryTapZone.of(x = 999f, width = 1000f)).isEqualTo(StoryTapZone.Next)
    }

    @Test
    fun `a degenerate width keeps the historic edge behaviour`() {
        assertThat(StoryTapZone.of(x = 10f, width = 0f)).isEqualTo(StoryTapZone.Next)
    }
}
