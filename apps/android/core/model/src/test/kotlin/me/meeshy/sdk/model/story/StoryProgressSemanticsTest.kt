package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryProgressSemanticsTest {
    @Test
    fun `neuf pas interieurs font des crans de dix pour cent`() {
        assertThat(StoryProgressSteps.INTERIOR_STEPS).isEqualTo(9)
        assertThat(1f / (StoryProgressSteps.INTERIOR_STEPS + 1)).isWithin(1e-6f).of(0.1f)
    }

    @Test
    fun `une cible se ramene au cran le plus proche`() {
        assertThat(StoryProgressSteps.snap(0.34f)).isWithin(1e-6f).of(0.3f)
        assertThat(StoryProgressSteps.snap(0.36f)).isWithin(1e-6f).of(0.4f)
        assertThat(StoryProgressSteps.snap(-1f)).isEqualTo(0f)
        assertThat(StoryProgressSteps.snap(2f)).isEqualTo(1f)
    }

    @Test
    fun `le pourcentage annonce est celui du cran`() {
        assertThat(StoryProgressSteps.percent(0.34f)).isEqualTo(30)
        assertThat(StoryProgressSteps.percent(1f)).isEqualTo(100)
    }
}
