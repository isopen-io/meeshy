package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behaviour of the pure drag-to-gesture resolver backing the story viewer's
 * swipe navigation. Screen coordinates: +x is right, +y is down. The dominant
 * axis (larger absolute travel) decides whether a drag is a horizontal group
 * jump or a vertical dismiss; only a downward drag dismisses. Below threshold,
 * nothing happens (so a small drift never hijacks a tap).
 */
class StorySwipeResolverTest {

    private val h = 80f
    private val v = 120f

    private fun resolve(x: Float, y: Float) =
        StorySwipeResolver.resolve(dragX = x, dragY = y, horizontalThreshold = h, verticalThreshold = v)

    @Test
    fun `a left swipe past the horizontal threshold jumps to the next group`() {
        assertThat(resolve(x = -200f, y = 0f)).isEqualTo(StorySwipeAction.NextGroup)
    }

    @Test
    fun `a right swipe past the horizontal threshold jumps to the previous group`() {
        assertThat(resolve(x = 200f, y = 0f)).isEqualTo(StorySwipeAction.PreviousGroup)
    }

    @Test
    fun `a downward swipe past the vertical threshold dismisses`() {
        assertThat(resolve(x = 0f, y = 300f)).isEqualTo(StorySwipeAction.Dismiss)
    }

    @Test
    fun `an upward swipe never dismisses`() {
        assertThat(resolve(x = 0f, y = -300f)).isEqualTo(StorySwipeAction.None)
    }

    @Test
    fun `a horizontal drag below the threshold does nothing`() {
        assertThat(resolve(x = -50f, y = 0f)).isEqualTo(StorySwipeAction.None)
    }

    @Test
    fun `a downward drag below the threshold does nothing`() {
        assertThat(resolve(x = 0f, y = 50f)).isEqualTo(StorySwipeAction.None)
    }

    @Test
    fun `no movement does nothing`() {
        assertThat(resolve(x = 0f, y = 0f)).isEqualTo(StorySwipeAction.None)
    }

    @Test
    fun `a horizontal-dominant diagonal resolves to the horizontal jump`() {
        // |x| > |y|, x past threshold, y below it → group jump, not dismiss.
        assertThat(resolve(x = -200f, y = 100f)).isEqualTo(StorySwipeAction.NextGroup)
    }

    @Test
    fun `a vertical-dominant downward diagonal resolves to dismiss`() {
        // |y| > |x|, y past threshold, x below it → dismiss, not group jump.
        assertThat(resolve(x = 60f, y = 300f)).isEqualTo(StorySwipeAction.Dismiss)
    }

    @Test
    fun `the horizontal threshold is inclusive at the boundary`() {
        assertThat(resolve(x = -h, y = 0f)).isEqualTo(StorySwipeAction.NextGroup)
        assertThat(resolve(x = h, y = 0f)).isEqualTo(StorySwipeAction.PreviousGroup)
    }

    @Test
    fun `the vertical threshold is inclusive at the boundary`() {
        assertThat(resolve(x = 0f, y = v)).isEqualTo(StorySwipeAction.Dismiss)
    }

    @Test
    fun `a horizontal-dominant drag that stays below the horizontal threshold does nothing`() {
        // |x| > |y| but |x| < threshold and the vertical arm must not fire either.
        assertThat(resolve(x = -70f, y = 40f)).isEqualTo(StorySwipeAction.None)
    }
}
