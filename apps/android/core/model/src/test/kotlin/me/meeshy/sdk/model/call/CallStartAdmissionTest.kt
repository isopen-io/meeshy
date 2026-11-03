package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallStartAdmissionTest {
    private val current = CallIdentity("conv-1", "peer-1", isOutgoing = true)
    private val other = CallIdentity("conv-2", "peer-2", isOutgoing = true)

    @Test
    fun `an idle machine starts the call`() {
        assertThat(CallStartAdmission.decide(CallState.Idle, current, other)).isEqualTo(CallStartAdmission.Start)
    }

    @Test
    fun `dialling during a live call is busy and leaves the call alone`() {
        assertThat(CallStartAdmission.decide(CallState.Connected, current, other)).isEqualTo(CallStartAdmission.Busy)
    }

    @Test
    fun `replaying the same request during a call is inert`() {
        assertThat(CallStartAdmission.decide(CallState.Connected, current, current.copy(callId = ""))).isEqualTo(CallStartAdmission.Inert)
    }

    @Test
    fun `a new call during the settle window resets the residual ended state`() {
        val ended = CallState.Ended(CallEndReason.Remote)
        assertThat(CallStartAdmission.decide(ended, current, other)).isEqualTo(CallStartAdmission.SettleThenStart)
    }

    @Test
    fun `the ended screen re-entering with the same request does not redial`() {
        val ended = CallState.Ended(CallEndReason.Failed("x"))
        assertThat(CallStartAdmission.decide(ended, current, current)).isEqualTo(CallStartAdmission.Inert)
    }

    @Test
    fun `an incoming request during a live call is left to the waiting banner`() {
        val incoming = CallIdentity("conv-3", "peer-3", isOutgoing = false, callId = "c3")
        assertThat(CallStartAdmission.decide(CallState.Connected, current, incoming)).isEqualTo(CallStartAdmission.Inert)
    }
}
