package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryStallIndicatorLawTest {
    @Test
    fun `le disque ne se montre qu'après 350 ms d'attente continue`() {
        assertThat(StoryStallIndicatorLaw.isVisible(null)).isFalse()
        assertThat(StoryStallIndicatorLaw.isVisible(349)).isFalse()
        assertThat(StoryStallIndicatorLaw.isVisible(350)).isTrue()
        assertThat(StoryStallIndicatorLaw.DIAMETER_DP).isEqualTo(52)
        assertThat(StoryStallIndicatorLaw.FADE_OUT_MS).isEqualTo(150)
    }
}
