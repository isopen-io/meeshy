package me.meeshy.sdk.model.composer.sound

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SoundPreviewLawTest {
    @Test
    fun `touching a sound that is not playing starts it and shows a wait until the player is ready`() {
        val out = SoundPreviewLaw.toggle(SoundPreviewState.Idle, "a", instant = false)
        assertThat(out.state).isEqualTo(SoundPreviewState.Preparing("a"))
        assertThat(out.command).isEqualTo(SoundPreviewCommand.Start("a"))
    }

    @Test
    fun `a sound already on disk plays without a wait state`() {
        val out = SoundPreviewLaw.toggle(SoundPreviewState.Idle, "a", instant = true)
        assertThat(out.state).isEqualTo(SoundPreviewState.Playing("a"))
    }

    @Test
    fun `touching the playing or preparing sound stops it - there is only one preview at a time`() {
        assertThat(SoundPreviewLaw.toggle(SoundPreviewState.Playing("a"), "a", instant = false))
            .isEqualTo(SoundPreviewOutcome(SoundPreviewState.Idle, SoundPreviewCommand.Stop))
        assertThat(SoundPreviewLaw.toggle(SoundPreviewState.Preparing("a"), "a", instant = false).command)
            .isEqualTo(SoundPreviewCommand.Stop)
    }

    @Test
    fun `touching another sound replaces the current one`() {
        val out = SoundPreviewLaw.toggle(SoundPreviewState.Playing("a"), "b", instant = false)
        assertThat(out.state).isEqualTo(SoundPreviewState.Preparing("b"))
        assertThat(out.command).isEqualTo(SoundPreviewCommand.Start("b"))
    }

    @Test
    fun `ready, end and failure bring the row back to its truth`() {
        assertThat(SoundPreviewLaw.ready(SoundPreviewState.Preparing("a"), "a")).isEqualTo(SoundPreviewState.Playing("a"))
        assertThat(SoundPreviewLaw.ready(SoundPreviewState.Preparing("b"), "a")).isEqualTo(SoundPreviewState.Preparing("b"))
        assertThat(SoundPreviewLaw.finished(SoundPreviewState.Playing("a"), "a")).isEqualTo(SoundPreviewState.Idle)
        assertThat(SoundPreviewLaw.finished(SoundPreviewState.Playing("b"), "a")).isEqualTo(SoundPreviewState.Playing("b"))
    }

    @Test
    fun `a removed sound that was previewing is stopped`() {
        assertThat(SoundPreviewLaw.removing(SoundPreviewState.Playing("a"), "a").command).isEqualTo(SoundPreviewCommand.Stop)
        assertThat(SoundPreviewLaw.removing(SoundPreviewState.Playing("a"), "b").command).isEqualTo(SoundPreviewCommand.None)
    }

    @Test
    fun `row flags`() {
        assertThat(SoundPreviewState.Playing("a").isPlaying("a")).isTrue()
        assertThat(SoundPreviewState.Preparing("a").isPreparing("a")).isTrue()
        assertThat(SoundPreviewState.Idle.isPlaying("a")).isFalse()
    }
}
