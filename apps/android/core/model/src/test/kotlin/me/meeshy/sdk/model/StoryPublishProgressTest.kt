package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryPublishProgressTest {

    @Test
    fun `the background weighs thirty percent of its slide`() {
        assertThat(StoryPublishProgress.fraction(slideIndex = 0, slideCount = 1, step = StoryPublishProgress.Step.Background))
            .isWithin(1e-9).of(0.30)
    }

    @Test
    fun `media fill the next fifty percent`() {
        val half = StoryPublishProgress.fraction(0, 1, StoryPublishProgress.Step.Media(done = 1, total = 2))
        assertThat(half).isWithin(1e-9).of(0.55)
        val all = StoryPublishProgress.fraction(0, 1, StoryPublishProgress.Step.Media(done = 2, total = 2))
        assertThat(all).isWithin(1e-9).of(0.80)
    }

    @Test
    fun `each slide owns an equal share and the last one ends at one`() {
        assertThat(StoryPublishProgress.fraction(1, 4, StoryPublishProgress.Step.Background)).isWithin(1e-9).of(0.25 + 0.075)
        assertThat(StoryPublishProgress.fraction(3, 4, StoryPublishProgress.Step.Done)).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `zero media does not divide by zero`() {
        val value = StoryPublishProgress.fraction(0, 1, StoryPublishProgress.Step.Media(done = 0, total = 0))
        assertThat(value).isWithin(1e-9).of(0.30)
    }

    @Test
    fun `an already published slide counts as complete`() {
        assertThat(StoryPublishProgress.fraction(0, 2, StoryPublishProgress.Step.Done)).isWithin(1e-9).of(0.5)
    }
}
