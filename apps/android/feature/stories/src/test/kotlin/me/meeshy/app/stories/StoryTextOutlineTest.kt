package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure text-outline model and its discrete tap-cycle — the
 * Android port of the iOS `StoryTextAttributeCycle.advance(.border)` steps. No Android,
 * no I/O: the thicken/wrap/colour-posting rules live in one unit-tested place so the
 * canvas Composable and the toolbar tap stay glue.
 */
@RunWith(JUnit4::class)
class StoryTextOutlineTest {

    // --- model ---

    @Test
    fun `a fresh outline draws nothing — zero width and no colour`() {
        val outline = StoryTextOutline()
        assertThat(outline.width).isEqualTo(StoryTextOutline.NONE_WIDTH)
        assertThat(outline.color).isNull()
        assertThat(outline.isVisible).isFalse()
    }

    @Test
    fun `an outline with a positive width and a colour is visible`() {
        assertThat(StoryTextOutline(width = 4f, color = "FF2E63").isVisible).isTrue()
    }

    @Test
    fun `a positive width with no colour paints nothing`() {
        assertThat(StoryTextOutline(width = 4f, color = null).isVisible).isFalse()
    }

    @Test
    fun `a colour with no width has nothing to paint`() {
        assertThat(StoryTextOutline(width = 0f, color = "FF2E63").isVisible).isFalse()
    }

    // --- advance: the thickness cycle ---

    @Test
    fun `advance visits every thickness step then wraps back to no-stroke`() {
        val seen = generateSequence(StoryTextOutline(width = 0f)) { StoryTextOutlineCycle.advance(it) }
            .drop(1)
            .take(5)
            .map { it.width }
            .toList()
        assertThat(seen).containsExactly(2f, 4f, 8f, 12f, 0f).inOrder()
    }

    @Test
    fun `advance from a width between steps jumps to the next higher step, never thinner`() {
        assertThat(StoryTextOutlineCycle.advance(StoryTextOutline(width = 5.5f, color = "FF2E63")).width)
            .isEqualTo(8f)
    }

    @Test
    fun `advance leaving zero posts the default white when no colour was chosen yet`() {
        val advanced = StoryTextOutlineCycle.advance(StoryTextOutline(width = 0f, color = null))
        assertThat(advanced.width).isEqualTo(2f)
        assertThat(advanced.color).isEqualTo(StoryTextOutlineCycle.DEFAULT_COLOR)
    }

    @Test
    fun `advance leaving zero keeps a colour the user already chose`() {
        assertThat(StoryTextOutlineCycle.advance(StoryTextOutline(width = 0f, color = "FF2E63")).color)
            .isEqualTo("FF2E63")
    }

    @Test
    fun `advance returning to zero keeps the colour so re-thickening never re-asks`() {
        val wrapped = StoryTextOutlineCycle.advance(StoryTextOutline(width = 12f, color = "FF2E63"))
        assertThat(wrapped.width).isEqualTo(StoryTextOutline.NONE_WIDTH)
        assertThat(wrapped.color).isEqualTo("FF2E63")
    }

    @Test
    fun `the offered steps are the four iOS thicknesses, thin to thick`() {
        assertThat(StoryTextOutlineCycle.steps).containsExactly(2f, 4f, 8f, 12f).inOrder()
    }
}
