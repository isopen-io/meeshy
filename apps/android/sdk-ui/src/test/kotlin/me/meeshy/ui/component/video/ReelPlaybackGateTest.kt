package me.meeshy.ui.component.video

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** iOS `ReelPlaybackRules`: a reel plays only while it is the visible page AND the app is in front. */
class ReelPlaybackGateTest {

    @Test
    fun `the visible reel plays while the app is in front`() {
        assertThat(ReelPlaybackGate.command(isActive = true, isForeground = true, rewindWhenInactive = true))
            .isEqualTo(ReelPlaybackCommand(playWhenReady = true, rewind = false))
    }

    @Test
    fun `leaving the app pauses the visible reel without rewinding it`() {
        assertThat(ReelPlaybackGate.command(isActive = true, isForeground = false, rewindWhenInactive = true))
            .isEqualTo(ReelPlaybackCommand(playWhenReady = false, rewind = false))
    }

    @Test
    fun `a page scrolled away pauses and rewinds`() {
        assertThat(ReelPlaybackGate.command(isActive = false, isForeground = true, rewindWhenInactive = true))
            .isEqualTo(ReelPlaybackCommand(playWhenReady = false, rewind = true))
    }

    @Test
    fun `a held story pauses in place`() {
        assertThat(ReelPlaybackGate.command(isActive = false, isForeground = true, rewindWhenInactive = false))
            .isEqualTo(ReelPlaybackCommand(playWhenReady = false, rewind = false))
    }
}
