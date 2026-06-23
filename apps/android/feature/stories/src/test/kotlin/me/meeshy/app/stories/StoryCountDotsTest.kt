package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCountDotsTest {

    @Test
    fun `no dots for an empty group`() {
        assertThat(StoryCountDots.from(storyCount = 0, unviewedCount = 0)).isNull()
    }

    @Test
    fun `no dots for a single story`() {
        assertThat(StoryCountDots.from(storyCount = 1, unviewedCount = 1)).isNull()
    }

    @Test
    fun `two stories all viewed renders two inactive dots`() {
        val dots = StoryCountDots.from(storyCount = 2, unviewedCount = 0)!!
        assertThat(dots.dotCount).isEqualTo(2)
        assertThat(dots.hasOverflow).isFalse()
        assertThat((0 until dots.dotCount).map(dots::isActive)).containsExactly(false, false).inOrder()
    }

    @Test
    fun `two stories all unviewed renders two active dots`() {
        val dots = StoryCountDots.from(storyCount = 2, unviewedCount = 2)!!
        assertThat((0 until dots.dotCount).map(dots::isActive)).containsExactly(true, true).inOrder()
    }

    @Test
    fun `partially viewed group activates the trailing unviewed dots`() {
        val dots = StoryCountDots.from(storyCount = 3, unviewedCount = 1)!!
        assertThat(dots.dotCount).isEqualTo(3)
        assertThat((0 until dots.dotCount).map(dots::isActive)).containsExactly(false, false, true).inOrder()
    }

    @Test
    fun `exactly five stories fill all dots without overflow`() {
        val dots = StoryCountDots.from(storyCount = 5, unviewedCount = 5)!!
        assertThat(dots.dotCount).isEqualTo(5)
        assertThat(dots.hasOverflow).isFalse()
        assertThat((0 until dots.dotCount).all(dots::isActive)).isTrue()
    }

    @Test
    fun `more than five stories caps the dots and flags overflow`() {
        val dots = StoryCountDots.from(storyCount = 8, unviewedCount = 8)!!
        assertThat(dots.dotCount).isEqualTo(5)
        assertThat(dots.hasOverflow).isTrue()
        assertThat((0 until dots.dotCount).all(dots::isActive)).isTrue()
    }

    @Test
    fun `overflow group still marks only the trailing unviewed dots active`() {
        val dots = StoryCountDots.from(storyCount = 8, unviewedCount = 2)!!
        assertThat(dots.dotCount).isEqualTo(5)
        assertThat(dots.hasOverflow).isTrue()
        assertThat((0 until dots.dotCount).map(dots::isActive))
            .containsExactly(false, false, false, true, true).inOrder()
    }

    @Test
    fun `unviewed count beyond the visible dots is clamped to all active`() {
        val dots = StoryCountDots.from(storyCount = 6, unviewedCount = 6)!!
        assertThat(dots.dotCount).isEqualTo(5)
        assertThat((0 until dots.dotCount).all(dots::isActive)).isTrue()
    }

    @Test
    fun `negative unviewed count is treated as none active`() {
        val dots = StoryCountDots.from(storyCount = 3, unviewedCount = -2)!!
        assertThat((0 until dots.dotCount).any(dots::isActive)).isFalse()
    }

    @Test
    fun `unviewed count larger than the story count never over-activates`() {
        val dots = StoryCountDots.from(storyCount = 2, unviewedCount = 9)!!
        assertThat(dots.dotCount).isEqualTo(2)
        assertThat((0 until dots.dotCount).all(dots::isActive)).isTrue()
    }

    @Test
    fun `isActive is inert for an out-of-range index`() {
        val dots = StoryCountDots.from(storyCount = 3, unviewedCount = 3)!!
        assertThat(dots.isActive(-1)).isFalse()
        assertThat(dots.isActive(dots.dotCount)).isFalse()
    }
}
