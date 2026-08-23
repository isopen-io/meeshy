package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure text-size model and its discrete tap-cycle. No Android,
 * no I/O: the size ladder and the wrap rule live in one unit-tested place so the canvas
 * Composable and the toolbar tap stay glue. The default step is the iOS-parity birth
 * size (fresh iOS text is 96 design units), so an Android caption is born the same size.
 */
@RunWith(JUnit4::class)
class StoryTextSizeTest {

    // --- the ladder ---

    @Test
    fun `the four steps carry the design-unit sizes small to large`() {
        assertThat(StoryTextSize.entries.map { it.designSize })
            .containsExactly(64f, 96f, 140f, 200f)
            .inOrder()
    }

    @Test
    fun `the default birth size is the iOS-parity medium — 96 design units`() {
        assertThat(StoryTextSize.DEFAULT).isEqualTo(StoryTextSize.MEDIUM)
        assertThat(StoryTextSize.DEFAULT.designSize).isEqualTo(96f)
    }

    @Test
    fun `the cycle steps are the four sizes, smallest to largest`() {
        assertThat(StoryTextSizeCycle.steps)
            .containsExactly(
                StoryTextSize.SMALL,
                StoryTextSize.MEDIUM,
                StoryTextSize.LARGE,
                StoryTextSize.XLARGE,
            )
            .inOrder()
    }

    // --- next: the size cycle ---

    @Test
    fun `next visits every larger step then wraps back to the smallest`() {
        val seen = generateSequence(StoryTextSize.SMALL) { StoryTextSizeCycle.next(it) }
            .drop(1)
            .take(4)
            .toList()
        assertThat(seen)
            .containsExactly(
                StoryTextSize.MEDIUM,
                StoryTextSize.LARGE,
                StoryTextSize.XLARGE,
                StoryTextSize.SMALL,
            )
            .inOrder()
    }

    @Test
    fun `next past the largest wraps to the smallest — text always has a size`() {
        assertThat(StoryTextSizeCycle.next(StoryTextSize.XLARGE)).isEqualTo(StoryTextSize.SMALL)
    }
}
