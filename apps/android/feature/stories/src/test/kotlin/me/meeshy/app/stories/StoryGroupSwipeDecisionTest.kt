package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryGroupSwipeDecisionTest {
    private val width = 1000f

    @Test
    fun `without a neighbour the card resists asymptotically and never leaves its edge band`() {
        val small = StoryGroupSwipeDecision.displayedTranslation(-100f, width, hasNeighbor = false)
        val huge = StoryGroupSwipeDecision.displayedTranslation(-100_000f, width, hasNeighbor = false)
        assertThat(small).isLessThan(0f)
        assertThat(small).isGreaterThan(-100f)
        assertThat(huge).isAtLeast(-width * StoryGroupSwipeDecision.EDGE_RESISTANCE_IN_WIDTHS)
        assertThat(StoryGroupSwipeDecision.displayedTranslation(100f, width, hasNeighbor = false)).isEqualTo(-StoryGroupSwipeDecision.displayedTranslation(-100f, width, hasNeighbor = false))
    }

    @Test
    fun `with a neighbour the card follows the finger one to one`() {
        assertThat(StoryGroupSwipeDecision.displayedTranslation(-437f, width, hasNeighbor = true)).isEqualTo(-437f)
    }

    @Test
    fun `the projected end commits at half a width and a reversing finger cancels`() {
        val commit = StoryGroupSwipeDecision.decide(-300f, -520f, width, hasNext = true, hasPrevious = true)
        assertThat(commit).isEqualTo(StoryGroupSwipeOutcome.Next)
        val short = StoryGroupSwipeDecision.decide(-300f, -480f, width, hasNext = true, hasPrevious = true)
        assertThat(short).isEqualTo(StoryGroupSwipeOutcome.Cancel)
        val reversing = StoryGroupSwipeDecision.decide(-700f, -520f, width, hasNext = true, hasPrevious = true)
        assertThat(reversing).isEqualTo(StoryGroupSwipeOutcome.Cancel)
    }

    @Test
    fun `no neighbour in the direction of the gesture cancels even past half`() {
        assertThat(StoryGroupSwipeDecision.decide(-800f, -800f, width, hasNext = false, hasPrevious = true)).isEqualTo(StoryGroupSwipeOutcome.Cancel)
        assertThat(StoryGroupSwipeDecision.decide(800f, 800f, width, hasNext = true, hasPrevious = false)).isEqualTo(StoryGroupSwipeOutcome.Cancel)
    }

    @Test
    fun `a finger tremor at release is not a reversal`() {
        assertThat(StoryGroupSwipeDecision.decide(-600f, -570f, width, hasNext = true, hasPrevious = true)).isEqualTo(StoryGroupSwipeOutcome.Next)
    }

    @Test
    fun `the inertia projection extends the travel by the velocity over a quarter second`() {
        assertThat(StoryGroupSwipeDecision.predictedEnd(-200f, -1000f)).isWithin(1e-3f).of(-450f)
    }
}
