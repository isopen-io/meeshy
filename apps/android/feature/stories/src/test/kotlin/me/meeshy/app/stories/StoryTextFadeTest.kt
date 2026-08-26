package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure text fade-timing model and its discrete tap-cycle — the
 * Android port of the iOS `StoryTextEditorView` fade in/out timing fields (0…5 s). No
 * Android, no I/O: the step/wrap rules live in one unit-tested place so the canvas
 * Composable and the toolbar taps stay glue. The two durations are independent, exactly
 * as iOS binds `fadeIn` and `fadeOut` to two separate controls.
 */
@RunWith(JUnit4::class)
class StoryTextFadeTest {

    // --- model ---

    @Test
    fun `a fresh fade has neither an in nor an out and is inactive`() {
        val fade = StoryTextFade()
        assertThat(fade.inSeconds).isEqualTo(StoryTextFade.NONE_SECONDS)
        assertThat(fade.outSeconds).isEqualTo(StoryTextFade.NONE_SECONDS)
        assertThat(fade.hasFadeIn).isFalse()
        assertThat(fade.hasFadeOut).isFalse()
        assertThat(fade.isActive).isFalse()
    }

    @Test
    fun `a positive fade-in seconds is a present, active fade-in`() {
        val fade = StoryTextFade(inSeconds = 1f)
        assertThat(fade.hasFadeIn).isTrue()
        assertThat(fade.isActive).isTrue()
    }

    @Test
    fun `a positive fade-out seconds is a present, active fade-out`() {
        val fade = StoryTextFade(outSeconds = 2f)
        assertThat(fade.hasFadeOut).isTrue()
        assertThat(fade.isActive).isTrue()
    }

    // --- cycledIn / cycledOut: the two independent durations ---

    @Test
    fun `cycledIn advances only the in duration, leaving the out untouched`() {
        val fade = StoryTextFade(inSeconds = 0f, outSeconds = 3f).cycledIn()
        assertThat(fade.inSeconds).isEqualTo(0.5f)
        assertThat(fade.outSeconds).isEqualTo(3f)
    }

    @Test
    fun `cycledOut advances only the out duration, leaving the in untouched`() {
        val fade = StoryTextFade(inSeconds = 2f, outSeconds = 0f).cycledOut()
        assertThat(fade.outSeconds).isEqualTo(0.5f)
        assertThat(fade.inSeconds).isEqualTo(2f)
    }

    // --- advance: the discrete duration cycle ---

    @Test
    fun `advance visits every step then wraps back to no-fade`() {
        val seen = generateSequence(StoryTextFade.NONE_SECONDS) { StoryTextFadeCycle.advance(it) }
            .drop(1)
            .take(6)
            .toList()
        assertThat(seen).containsExactly(0.5f, 1f, 2f, 3f, 5f, StoryTextFade.NONE_SECONDS).inOrder()
    }

    @Test
    fun `advance from a value between steps jumps to the next higher step, never lower`() {
        assertThat(StoryTextFadeCycle.advance(1.5f)).isEqualTo(2f)
    }

    @Test
    fun `advance past the longest step wraps back to no-fade`() {
        assertThat(StoryTextFadeCycle.advance(5f)).isEqualTo(StoryTextFade.NONE_SECONDS)
    }

    @Test
    fun `advance from beyond the longest step still wraps back to no-fade`() {
        assertThat(StoryTextFadeCycle.advance(9f)).isEqualTo(StoryTextFade.NONE_SECONDS)
    }

    @Test
    fun `the offered steps are the iOS-range durations, short to long, all within five seconds`() {
        assertThat(StoryTextFadeCycle.steps).containsExactly(0.5f, 1f, 2f, 3f, 5f).inOrder()
        assertThat(StoryTextFadeCycle.steps.max()).isEqualTo(5f)
    }
}
