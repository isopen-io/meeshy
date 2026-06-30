package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure call-lifecycle FSM. Mirrors the iOS
 * `CallManager` transition table (CallState / CallEndReason in
 * `WebRTCTypes.swift` + `CallManager.swift`) exactly, and is the single source
 * of truth the future `:feature:calls` wiring drives. iOS only tracks the FSM
 * informally (a real validator is a P1 "todo" in its SOTA plan) — Android gets
 * it provably-correct from the base.
 *
 * Tested through `CallStateMachine.reduce(state, event)` only — no reflection,
 * no implementation details. Every `when` arm (including the inert/no-op arms
 * and the reconnect-budget boundary) is exercised.
 */
class CallStateMachineTest {

    private fun reduce(state: CallState, event: CallEvent, max: Int = 3): CallState =
        CallStateMachine.reduce(state, event, max)

    // --- Idle ---------------------------------------------------------------

    @Test
    fun `idle starts an outgoing call as ringing-outgoing`() {
        assertThat(reduce(CallState.Idle, CallEvent.StartOutgoing))
            .isEqualTo(CallState.Ringing(isOutgoing = true))
    }

    @Test
    fun `idle receives an incoming call as ringing-incoming`() {
        assertThat(reduce(CallState.Idle, CallEvent.ReceiveIncoming))
            .isEqualTo(CallState.Ringing(isOutgoing = false))
    }

    @Test
    fun `idle ignores mid-call events`() {
        assertThat(reduce(CallState.Idle, CallEvent.MediaConnected)).isEqualTo(CallState.Idle)
        assertThat(reduce(CallState.Idle, CallEvent.LocalAnswer)).isEqualTo(CallState.Idle)
        assertThat(reduce(CallState.Idle, CallEvent.Settle)).isEqualTo(CallState.Idle)
    }

    // --- Ringing (outgoing) -------------------------------------------------

    @Test
    fun `outgoing ringing advances to offering when the peer joins`() {
        assertThat(reduce(CallState.Ringing(isOutgoing = true), CallEvent.ParticipantJoined))
            .isEqualTo(CallState.Offering)
    }

    @Test
    fun `outgoing ringing ignores a local answer`() {
        val state = CallState.Ringing(isOutgoing = true)
        assertThat(reduce(state, CallEvent.LocalAnswer)).isEqualTo(state)
    }

    @Test
    fun `outgoing ringing cancelled by the caller ends local`() {
        assertThat(reduce(CallState.Ringing(isOutgoing = true), CallEvent.LocalHangUp))
            .isEqualTo(CallState.Ended(CallEndReason.Local))
    }

    @Test
    fun `outgoing ringing declined by the peer arrives as remote hang-up`() {
        assertThat(reduce(CallState.Ringing(isOutgoing = true), CallEvent.RemoteHangUp))
            .isEqualTo(CallState.Ended(CallEndReason.Remote))
    }

    @Test
    fun `ringing that times out is missed`() {
        assertThat(reduce(CallState.Ringing(isOutgoing = true), CallEvent.RingTimeout))
            .isEqualTo(CallState.Ended(CallEndReason.Missed))
        assertThat(reduce(CallState.Ringing(isOutgoing = false), CallEvent.RingTimeout))
            .isEqualTo(CallState.Ended(CallEndReason.Missed))
    }

    // --- Ringing (incoming) -------------------------------------------------

    @Test
    fun `incoming ringing connects when the local user answers`() {
        assertThat(reduce(CallState.Ringing(isOutgoing = false), CallEvent.LocalAnswer))
            .isEqualTo(CallState.Connecting)
    }

    @Test
    fun `incoming ringing declined by the local user ends rejected`() {
        assertThat(reduce(CallState.Ringing(isOutgoing = false), CallEvent.Reject))
            .isEqualTo(CallState.Ended(CallEndReason.Rejected))
    }

    @Test
    fun `outgoing ringing ignores a reject and a participant join is incoming-inert`() {
        val outgoing = CallState.Ringing(isOutgoing = true)
        assertThat(reduce(outgoing, CallEvent.Reject)).isEqualTo(outgoing)
        val incoming = CallState.Ringing(isOutgoing = false)
        assertThat(reduce(incoming, CallEvent.ParticipantJoined)).isEqualTo(incoming)
    }

    // --- Offering -----------------------------------------------------------

    @Test
    fun `offering connects on the remote answer`() {
        assertThat(reduce(CallState.Offering, CallEvent.RemoteAnswer))
            .isEqualTo(CallState.Connecting)
    }

    @Test
    fun `offering ignores a ring timeout (cancelled once the peer joined)`() {
        assertThat(reduce(CallState.Offering, CallEvent.RingTimeout))
            .isEqualTo(CallState.Offering)
    }

    @Test
    fun `offering fails with the carried error message`() {
        assertThat(reduce(CallState.Offering, CallEvent.ConnectionFailed("ice-timeout")))
            .isEqualTo(CallState.Ended(CallEndReason.Failed("ice-timeout")))
    }

    // --- Connecting ---------------------------------------------------------

    @Test
    fun `connecting reaches connected when media flows`() {
        assertThat(reduce(CallState.Connecting, CallEvent.MediaConnected))
            .isEqualTo(CallState.Connected)
    }

    @Test
    fun `connecting ignores a stall (no media yet)`() {
        assertThat(reduce(CallState.Connecting, CallEvent.ConnectionStalled))
            .isEqualTo(CallState.Connecting)
    }

    // --- Connected ----------------------------------------------------------

    @Test
    fun `connected drops to reconnecting on the first stall`() {
        assertThat(reduce(CallState.Connected, CallEvent.ConnectionStalled))
            .isEqualTo(CallState.Reconnecting(attempt = 1))
    }

    @Test
    fun `connected ignores a redundant media-connected`() {
        assertThat(reduce(CallState.Connected, CallEvent.MediaConnected))
            .isEqualTo(CallState.Connected)
    }

    @Test
    fun `connected ended by the peer is remote`() {
        assertThat(reduce(CallState.Connected, CallEvent.RemoteHangUp))
            .isEqualTo(CallState.Ended(CallEndReason.Remote))
    }

    // --- Reconnecting -------------------------------------------------------

    @Test
    fun `reconnecting recovers to connected when media returns`() {
        assertThat(reduce(CallState.Reconnecting(attempt = 2), CallEvent.MediaConnected))
            .isEqualTo(CallState.Connected)
    }

    @Test
    fun `a failed reconnect attempt increments the counter below the budget`() {
        assertThat(reduce(CallState.Reconnecting(attempt = 1), CallEvent.ReconnectFailed))
            .isEqualTo(CallState.Reconnecting(attempt = 2))
    }

    @Test
    fun `exhausting the reconnect budget ends connection-lost`() {
        assertThat(reduce(CallState.Reconnecting(attempt = 3), CallEvent.ReconnectFailed, max = 3))
            .isEqualTo(CallState.Ended(CallEndReason.ConnectionLost))
    }

    @Test
    fun `a single-attempt budget is exhausted by one failure`() {
        assertThat(reduce(CallState.Reconnecting(attempt = 1), CallEvent.ReconnectFailed, max = 1))
            .isEqualTo(CallState.Ended(CallEndReason.ConnectionLost))
    }

    @Test
    fun `reconnecting can be hung up locally`() {
        assertThat(reduce(CallState.Reconnecting(attempt = 2), CallEvent.LocalHangUp))
            .isEqualTo(CallState.Ended(CallEndReason.Local))
    }

    // --- Ended (terminal, idempotent) --------------------------------------

    @Test
    fun `ended settles back to idle`() {
        assertThat(reduce(CallState.Ended(CallEndReason.Local), CallEvent.Settle))
            .isEqualTo(CallState.Idle)
    }

    @Test
    fun `ended is inert to further hang-ups and keeps its original reason`() {
        val ended = CallState.Ended(CallEndReason.Rejected)
        assertThat(reduce(ended, CallEvent.LocalHangUp)).isEqualTo(ended)
        assertThat(reduce(ended, CallEvent.MediaConnected)).isEqualTo(ended)
    }

    // --- Derived state flags ------------------------------------------------

    @Test
    fun `isActive is true only between idle and ended`() {
        assertThat(CallState.Idle.isActive).isFalse()
        assertThat(CallState.Ended(CallEndReason.Local).isActive).isFalse()
        assertThat(CallState.Ringing(isOutgoing = true).isActive).isTrue()
        assertThat(CallState.Offering.isActive).isTrue()
        assertThat(CallState.Connecting.isActive).isTrue()
        assertThat(CallState.Connected.isActive).isTrue()
        assertThat(CallState.Reconnecting(attempt = 1).isActive).isTrue()
    }

    @Test
    fun `isRinging isEnded and canStart classify the lifecycle`() {
        assertThat(CallState.Ringing(isOutgoing = false).isRinging).isTrue()
        assertThat(CallState.Connected.isRinging).isFalse()
        assertThat(CallState.Ended(CallEndReason.Missed).isEnded).isTrue()
        assertThat(CallState.Connecting.isEnded).isFalse()
        assertThat(CallState.Idle.canStart).isTrue()
        assertThat(CallState.Connected.canStart).isFalse()
    }

    // --- End-to-end folds ---------------------------------------------------

    @Test
    fun `the full outgoing happy path folds to connected`() {
        val events = listOf(
            CallEvent.StartOutgoing,
            CallEvent.ParticipantJoined,
            CallEvent.RemoteAnswer,
            CallEvent.MediaConnected,
        )
        val end = events.fold<CallEvent, CallState>(CallState.Idle) { s, e -> reduce(s, e) }
        assertThat(end).isEqualTo(CallState.Connected)
    }

    @Test
    fun `the full incoming happy path folds to connected`() {
        val events = listOf(
            CallEvent.ReceiveIncoming,
            CallEvent.LocalAnswer,
            CallEvent.MediaConnected,
        )
        val end = events.fold<CallEvent, CallState>(CallState.Idle) { s, e -> reduce(s, e) }
        assertThat(end).isEqualTo(CallState.Connected)
    }

    @Test
    fun `a stall then a successful reconnect returns to connected`() {
        val events = listOf(
            CallEvent.ConnectionStalled,
            CallEvent.ReconnectFailed,
            CallEvent.MediaConnected,
        )
        val end = events.fold<CallEvent, CallState>(CallState.Connected) { s, e -> reduce(s, e) }
        assertThat(end).isEqualTo(CallState.Connected)
    }
}
