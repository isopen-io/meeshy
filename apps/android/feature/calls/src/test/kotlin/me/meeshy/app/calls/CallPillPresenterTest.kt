package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for the pure floating-pill display decision. The pill is
 * the Android analogue of iOS `FloatingCallPillView` — it surfaces a *live,
 * non-incoming* call the user has navigated away from, and never a ringing
 * incoming call (which must be answered/declined full-screen first) nor a settled
 * one. It also stays hidden while the full-screen call surface is itself on top.
 */
class CallPillPresenterTest {

    @Test
    fun `outgoing ringing, connecting, connected and reconnecting are minimizable`() {
        assertThat(CallPillPresenter.isMinimizable(CallStatus.OUTGOING_RINGING)).isTrue()
        assertThat(CallPillPresenter.isMinimizable(CallStatus.CONNECTING)).isTrue()
        assertThat(CallPillPresenter.isMinimizable(CallStatus.CONNECTED)).isTrue()
        assertThat(CallPillPresenter.isMinimizable(CallStatus.RECONNECTING)).isTrue()
    }

    @Test
    fun `an incoming ringing call is not minimizable`() {
        assertThat(CallPillPresenter.isMinimizable(CallStatus.INCOMING)).isFalse()
    }

    @Test
    fun `a settled call is not minimizable`() {
        assertThat(CallPillPresenter.isMinimizable(CallStatus.IDLE)).isFalse()
        assertThat(CallPillPresenter.isMinimizable(CallStatus.ENDED)).isFalse()
    }

    @Test
    fun `the pill shows for a live non-incoming call away from the call screen`() {
        assertThat(CallPillPresenter.shouldShow(CallStatus.OUTGOING_RINGING, onCallScreen = false)).isTrue()
        assertThat(CallPillPresenter.shouldShow(CallStatus.CONNECTING, onCallScreen = false)).isTrue()
        assertThat(CallPillPresenter.shouldShow(CallStatus.CONNECTED, onCallScreen = false)).isTrue()
        assertThat(CallPillPresenter.shouldShow(CallStatus.RECONNECTING, onCallScreen = false)).isTrue()
    }

    @Test
    fun `the pill hides while the full-screen call surface is on top`() {
        assertThat(CallPillPresenter.shouldShow(CallStatus.CONNECTED, onCallScreen = true)).isFalse()
        assertThat(CallPillPresenter.shouldShow(CallStatus.OUTGOING_RINGING, onCallScreen = true)).isFalse()
    }

    @Test
    fun `the pill hides for an incoming call even off the call screen`() {
        assertThat(CallPillPresenter.shouldShow(CallStatus.INCOMING, onCallScreen = false)).isFalse()
    }

    @Test
    fun `the pill hides once the call has settled`() {
        assertThat(CallPillPresenter.shouldShow(CallStatus.ENDED, onCallScreen = false)).isFalse()
        assertThat(CallPillPresenter.shouldShow(CallStatus.IDLE, onCallScreen = false)).isFalse()
    }
}
