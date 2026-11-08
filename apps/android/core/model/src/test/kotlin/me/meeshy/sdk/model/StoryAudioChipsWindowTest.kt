package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryAudioChipsWindowTest {
    private val chips = listOf(
        StoryAudioChipWindow("early", startTime = 0.0, duration = 2.0),
        StoryAudioChipWindow("late", startTime = 3.0, duration = 2.0),
        StoryAudioChipWindow("open", startTime = 1.0, duration = 0.0),
    )

    @Test fun `une pastille n'apparait que dans sa fenetre`() {
        assertThat(StoryAudioChipsWindow.visibleIds(chips, 0.5)).containsExactly("early")
        assertThat(StoryAudioChipsWindow.visibleIds(chips, 1.5)).containsExactly("early", "open").inOrder()
        assertThat(StoryAudioChipsWindow.visibleIds(chips, 3.5)).containsExactly("late", "open").inOrder()
    }

    @Test fun `la fin de la fenetre est exclue`() {
        assertThat(StoryAudioChipsWindow.visibleIds(chips, 2.0)).containsExactly("open")
        assertThat(StoryAudioChipsWindow.visibleIds(chips, 5.0)).containsExactly("open")
    }

    @Test fun `une duree nulle dure jusqu'a la fin de la slide`() {
        assertThat(StoryAudioChipsWindow.visibleIds(chips, 99.0)).containsExactly("open")
    }
}
