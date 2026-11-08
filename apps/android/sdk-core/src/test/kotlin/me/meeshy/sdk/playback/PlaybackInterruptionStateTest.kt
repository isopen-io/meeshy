package me.meeshy.sdk.playback

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class PlaybackInterruptionStateTest {

    @Test
    fun `l'interruption est un etat observable`() = runTest {
        val state = PlaybackInterruptionState()

        state.current.test {
            assertThat(awaitItem().isInterrupted).isFalse()
            state.begin(InterruptionCause.Call)
            assertThat(awaitItem().cause).isEqualTo(InterruptionCause.Call)
            state.end()
            assertThat(awaitItem().isInterrupted).isFalse()
        }
    }

    @Test
    fun `un lecteur monte pendant l'interruption la lit a son montage`() {
        val state = PlaybackInterruptionState()
        state.begin(InterruptionCause.Focus)

        assertThat(state.current.value.cause).isEqualTo(InterruptionCause.Focus)
    }
}
