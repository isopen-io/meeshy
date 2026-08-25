package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for [StoryElementVisibility] — the pure play-mode timing-window
 * gate ported from iOS `StoryRenderer.shouldRender(item:at:mode:)`. An element is
 * drawn iff the playhead lies in `[startTime, startTime + duration)`: inclusive at
 * the start, exclusive at the end (a sharp on/off cut, not a fade). A non-positive
 * [duration] means an OPEN-ENDED element (always visible from its start on) — the
 * Android convention where an absent wire duration collapses to `0.0`, matching
 * how [StoryMediaFadeResolver] and the foreground transition path already read it.
 */
@RunWith(JUnit4::class)
class StoryElementVisibilityTest {

    private fun visible(
        startTime: Double = 0.0,
        duration: Double = 0.0,
        currentTime: Double,
    ): Boolean = StoryElementVisibility.isVisible(
        startTime = startTime,
        duration = duration,
        currentTime = currentTime,
    )

    @Test
    fun `an untimed element with no start and no duration is always visible`() {
        assertThat(visible(startTime = 0.0, duration = 0.0, currentTime = 0.0)).isTrue()
        assertThat(visible(startTime = 0.0, duration = 0.0, currentTime = 5.0)).isTrue()
        assertThat(visible(startTime = 0.0, duration = 0.0, currentTime = 10_000.0)).isTrue()
    }

    @Test
    fun `before the window opens the element is hidden`() {
        assertThat(visible(startTime = 2.0, duration = 3.0, currentTime = 1.0)).isFalse()
    }

    @Test
    fun `the window start is inclusive`() {
        assertThat(visible(startTime = 2.0, duration = 3.0, currentTime = 2.0)).isTrue()
    }

    @Test
    fun `inside the window the element is visible`() {
        assertThat(visible(startTime = 2.0, duration = 3.0, currentTime = 4.99)).isTrue()
    }

    @Test
    fun `the window end is exclusive`() {
        // window [2, 5): t == 5 is already out.
        assertThat(visible(startTime = 2.0, duration = 3.0, currentTime = 5.0)).isFalse()
    }

    @Test
    fun `after the window closes the element is hidden`() {
        assertThat(visible(startTime = 2.0, duration = 3.0, currentTime = 6.0)).isFalse()
    }

    @Test
    fun `a start with no duration is open-ended once it opens`() {
        assertThat(visible(startTime = 3.0, duration = 0.0, currentTime = 2.999)).isFalse()
        assertThat(visible(startTime = 3.0, duration = 0.0, currentTime = 3.0)).isTrue()
        assertThat(visible(startTime = 3.0, duration = 0.0, currentTime = 9_999.0)).isTrue()
    }

    @Test
    fun `a negative duration is treated as open-ended not as a closed window`() {
        assertThat(visible(startTime = 1.0, duration = -4.0, currentTime = 100.0)).isTrue()
    }

    @Test
    fun `a negative start time opens the window earlier`() {
        // window [-1, 1): t=0 visible, t=1 already out.
        assertThat(visible(startTime = -1.0, duration = 2.0, currentTime = 0.0)).isTrue()
        assertThat(visible(startTime = -1.0, duration = 2.0, currentTime = 1.0)).isFalse()
    }

    @Test
    fun `an infinite duration is open-ended`() {
        assertThat(visible(startTime = 2.0, duration = Double.POSITIVE_INFINITY, currentTime = 5.0)).isTrue()
    }

    @Test
    fun `a non-finite playhead fails open so a clock glitch never hides content`() {
        assertThat(visible(startTime = 2.0, duration = 3.0, currentTime = Double.NaN)).isTrue()
        assertThat(visible(startTime = 2.0, duration = 3.0, currentTime = Double.POSITIVE_INFINITY)).isTrue()
    }

    @Test
    fun `a non-finite start time is treated as zero`() {
        // start collapses to 0, duration 3 -> window [0, 3): t=1 visible, t=4 out.
        assertThat(visible(startTime = Double.NaN, duration = 3.0, currentTime = 1.0)).isTrue()
        assertThat(visible(startTime = Double.NaN, duration = 3.0, currentTime = 4.0)).isFalse()
    }
}
