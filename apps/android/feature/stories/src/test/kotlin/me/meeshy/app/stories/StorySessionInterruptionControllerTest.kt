package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StorySessionInterruptionControllerTest {

    private class Harness {
        var playing = true
        var settled = 0
        val controller = StorySessionInterruptionController().also {
            it.bind(isPlaying = { playing }, settleAsPause = { settled++ })
        }
    }

    @Test
    fun `a focus loss freezes the clock and the gain resumes it`() {
        val h = Harness()

        h.controller.onFocusLost()
        assertThat(h.controller.frozen).isTrue()
        h.controller.onFocusGained()
        assertThat(h.controller.frozen).isFalse()
        assertThat(h.settled).isEqualTo(0)
    }

    @Test
    fun `a permanent loss leaves the story paused as a user pause`() {
        val h = Harness()

        h.controller.onFocusLost()
        h.controller.onFocusLostForGood()

        assertThat(h.controller.frozen).isFalse()
        assertThat(h.settled).isEqualTo(1)
    }

    @Test
    fun `a user pause during the interruption wins over the resume`() {
        val h = Harness()
        h.controller.onFocusLost()

        h.controller.userPaused()
        h.controller.onFocusGained()

        assertThat(h.controller.frozen).isFalse()
        assertThat(h.settled).isEqualTo(0)
    }

    @Test
    fun `a story already held is not frozen by an interruption`() {
        val h = Harness().also { it.playing = false }

        h.controller.onFocusLost()

        assertThat(h.controller.frozen).isFalse()
    }

    @Test
    fun `back in the foreground resumes unless another app still plays`() {
        val h = Harness()
        h.controller.onFocusLost()

        h.controller.onReturnedToForeground(otherAudioPlaying = true)
        assertThat(h.controller.frozen).isTrue()
        h.controller.onReturnedToForeground(otherAudioPlaying = false)
        assertThat(h.controller.frozen).isFalse()
    }
}
