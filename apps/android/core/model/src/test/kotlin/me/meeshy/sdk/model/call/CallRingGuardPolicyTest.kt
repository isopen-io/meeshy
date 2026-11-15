package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallRingGuardPolicyTest {

    @Test
    fun `the caller is guarded while ringing and while offering`() {
        assertThat(CallRingGuardPolicy.guardFor(CallState.Ringing(isOutgoing = true))).isEqualTo(CallRingGuard.Outgoing)
        assertThat(CallRingGuardPolicy.guardFor(CallState.Offering)).isEqualTo(CallRingGuard.Outgoing)
    }

    @Test
    fun `the callee is guarded while ringing`() {
        assertThat(CallRingGuardPolicy.guardFor(CallState.Ringing(isOutgoing = false))).isEqualTo(CallRingGuard.Incoming)
    }

    @Test
    fun `an answered or finished call is not guarded`() {
        listOf(
            CallState.Idle, CallState.Connecting, CallState.Connected, CallState.Reconnecting(1),
            CallState.Ended(CallEndReason.Local),
        ).forEach { assertThat(CallRingGuardPolicy.guardFor(it)).isNull() }
    }

    @Test
    fun `the callee keeps a margin over the ring budget so the gateway speaks first`() {
        assertThat(CallRingGuard.Outgoing.timeoutMs).isEqualTo(45_000L)
        assertThat(CallRingGuard.Incoming.timeoutMs).isEqualTo(75_000L)
    }
}
