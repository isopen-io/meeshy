package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure element-timing model and its discrete tap-cycle — the
 * Android port of the iOS `StoryTextEditorView` start/duration timing fields (0…30 s,
 * step 0.5). No Android, no I/O: the step/wrap rules live in one unit-tested place so the
 * canvas Composable and the toolbar taps stay glue. The two ends are independent, exactly
 * as iOS binds `startTime` and `duration` to two separate controls, and each end folds a
 * zero back to "unset" so a fresh element rides the wire with no timing at all.
 */
@RunWith(JUnit4::class)
class StoryElementTimingTest {

    // --- model ---

    @Test
    fun `a fresh timing has neither a start nor a duration and is inactive`() {
        val timing = StoryElementTiming()
        assertThat(timing.startSeconds).isEqualTo(StoryElementTiming.NONE_SECONDS)
        assertThat(timing.durationSeconds).isEqualTo(StoryElementTiming.NONE_SECONDS)
        assertThat(timing.hasStart).isFalse()
        assertThat(timing.isTimed).isFalse()
        assertThat(timing.isActive).isFalse()
    }

    @Test
    fun `a positive start seconds is a present, active start`() {
        val timing = StoryElementTiming(startSeconds = 2f)
        assertThat(timing.hasStart).isTrue()
        assertThat(timing.isTimed).isFalse()
        assertThat(timing.isActive).isTrue()
    }

    @Test
    fun `a positive duration seconds closes the window and is active`() {
        val timing = StoryElementTiming(durationSeconds = 5f)
        assertThat(timing.isTimed).isTrue()
        assertThat(timing.hasStart).isFalse()
        assertThat(timing.isActive).isTrue()
    }

    // --- cycledStart / cycledDuration: the two independent ends ---

    @Test
    fun `cycledStart advances only the start, leaving the duration untouched`() {
        val timing = StoryElementTiming(startSeconds = 0f, durationSeconds = 5f).cycledStart()
        assertThat(timing.startSeconds).isEqualTo(1f)
        assertThat(timing.durationSeconds).isEqualTo(5f)
    }

    @Test
    fun `cycledDuration advances only the duration, leaving the start untouched`() {
        val timing = StoryElementTiming(startSeconds = 3f, durationSeconds = 0f).cycledDuration()
        assertThat(timing.durationSeconds).isEqualTo(1f)
        assertThat(timing.startSeconds).isEqualTo(3f)
    }

    // --- advance: the discrete second cycle ---

    @Test
    fun `advance visits every step then wraps back to none`() {
        val seen = generateSequence(StoryElementTiming.NONE_SECONDS) { StoryElementTimingCycle.advance(it) }
            .drop(1)
            .take(8)
            .toList()
        assertThat(seen)
            .containsExactly(1f, 2f, 3f, 5f, 10f, 15f, 30f, StoryElementTiming.NONE_SECONDS)
            .inOrder()
    }

    @Test
    fun `advance from a value between steps jumps to the next higher step, never lower`() {
        assertThat(StoryElementTimingCycle.advance(4f)).isEqualTo(5f)
    }

    @Test
    fun `advance past the longest step wraps back to none`() {
        assertThat(StoryElementTimingCycle.advance(30f)).isEqualTo(StoryElementTiming.NONE_SECONDS)
    }

    @Test
    fun `advance from beyond the longest step still wraps back to none`() {
        assertThat(StoryElementTimingCycle.advance(45f)).isEqualTo(StoryElementTiming.NONE_SECONDS)
    }

    @Test
    fun `the offered steps are the iOS-range durations, short to long, all within thirty seconds`() {
        assertThat(StoryElementTimingCycle.steps)
            .containsExactly(1f, 2f, 3f, 5f, 10f, 15f, 30f)
            .inOrder()
        assertThat(StoryElementTimingCycle.steps.max()).isEqualTo(30f)
    }
}
