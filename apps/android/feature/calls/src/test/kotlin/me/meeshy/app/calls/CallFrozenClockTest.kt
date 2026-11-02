package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallState
import org.junit.Test

/** Le chrono vivant ne passe pas par l'état de l'écran : un tic de 1 Hz ne le change pas. */
class CallFrozenClockTest {

    private val config = CallConfig(peerId = "u1", peerName = "Alice", isVideo = false, isOutgoing = true)

    private fun at(state: CallState, seconds: Long) = CallPresenter.present(state, config, CallMedia(), seconds)

    @Test
    fun `two ticks of a connected call give the same screen state`() {
        val a = at(CallState.Connected, 7)
        val b = at(CallState.Connected, 8)
        assertThat(a).isNotEqualTo(b)
        assertThat(a.withFrozenClock()).isEqualTo(b.withFrozenClock())
    }

    @Test
    fun `a reconnecting call keeps the frozen clock too`() {
        val s = at(CallState.Reconnecting(attempt = 1), 90)
        assertThat(s.withFrozenClock().durationLabel).isEqualTo(FROZEN_CLOCK)
        assertThat(s.hasLiveClock).isTrue()
    }

    @Test
    fun `the final length of an ended call is kept for the screen reader`() {
        val s = at(CallState.Ended(CallEndReason.Local), 125)
        assertThat(s.durationLabel).isEqualTo("02:05")
        assertThat(s.withFrozenClock()).isEqualTo(s)
        assertThat(s.hasLiveClock).isFalse()
    }

    @Test
    fun `a call that never connected has no clock to freeze`() {
        val s = at(CallState.Connecting, 0)
        assertThat(s.withFrozenClock().durationLabel).isNull()
    }
}
