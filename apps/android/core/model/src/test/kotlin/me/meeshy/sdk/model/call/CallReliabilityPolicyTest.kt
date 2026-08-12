package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the pure call-reliability policy: the degraded-signal
 * hint, half-open media self-heal, the connect/reconnect watchdogs, reconnection-
 * trigger arbitration, and the FSM invariants around when an ICE restart / clock
 * reset is allowed. Every arm of every decision is pinned, including the boundary
 * value and the inert/no-op arm; a handful of calls omit the tuning arguments so
 * the production defaults in [CallQualityThresholds] are exercised against their
 * iOS-parity values.
 */
class CallReliabilityPolicyTest {

    // --- signalingDegraded -----------------------------------------------------

    @Test
    fun `signaling is degraded only when an established call loses the socket`() {
        assertThat(CallReliabilityPolicy.signalingDegraded(callEstablished = true, socketConnected = false)).isTrue()
    }

    @Test
    fun `an established call with a live socket is not degraded`() {
        assertThat(CallReliabilityPolicy.signalingDegraded(callEstablished = true, socketConnected = true)).isFalse()
    }

    @Test
    fun `a not-yet-established call is never flagged degraded even without a socket`() {
        assertThat(CallReliabilityPolicy.signalingDegraded(callEstablished = false, socketConnected = false)).isFalse()
        assertThat(CallReliabilityPolicy.signalingDegraded(callEstablished = false, socketConnected = true)).isFalse()
    }

    // --- evaluateHalfOpen ------------------------------------------------------

    @Test
    fun `enough inbound packets is healthy regardless of grace or outbound`() {
        val outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets = 5,
            outboundPackets = 0,
            secondsInConnected = 0.0,
            requiredInboundPackets = 5,
            graceSeconds = 4.0,
        )
        assertThat(outcome).isEqualTo(HalfOpenOutcome.Healthy)
    }

    @Test
    fun `one packet below the inbound gate is not yet healthy`() {
        val outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets = 4,
            outboundPackets = 10,
            secondsInConnected = 10.0,
            requiredInboundPackets = 5,
            graceSeconds = 4.0,
        )
        assertThat(outcome).isEqualTo(HalfOpenOutcome.HealHalfOpen)
    }

    @Test
    fun `inside the grace window a missing inbound stream keeps waiting`() {
        val outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets = 0,
            outboundPackets = 10,
            secondsInConnected = 3.999,
            requiredInboundPackets = 5,
            graceSeconds = 4.0,
        )
        assertThat(outcome).isEqualTo(HalfOpenOutcome.Waiting)
    }

    @Test
    fun `past grace with outbound flowing and no inbound heals the half-open path`() {
        val outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets = 0,
            outboundPackets = 1,
            secondsInConnected = 4.0,
            requiredInboundPackets = 5,
            graceSeconds = 4.0,
        )
        assertThat(outcome).isEqualTo(HalfOpenOutcome.HealHalfOpen)
    }

    @Test
    fun `past grace with no outbound either is a mic-off condition, not a fault`() {
        val outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets = 0,
            outboundPackets = 0,
            secondsInConnected = 4.0,
            requiredInboundPackets = 5,
            graceSeconds = 4.0,
        )
        assertThat(outcome).isEqualTo(HalfOpenOutcome.Waiting)
    }

    @Test
    fun `half-open defaults pin the iOS gate of five packets and four seconds`() {
        assertThat(
            CallReliabilityPolicy.evaluateHalfOpen(inboundPackets = 5, outboundPackets = 0, secondsInConnected = 100.0),
        ).isEqualTo(HalfOpenOutcome.Healthy)
        assertThat(
            CallReliabilityPolicy.evaluateHalfOpen(inboundPackets = 4, outboundPackets = 1, secondsInConnected = 3.99),
        ).isEqualTo(HalfOpenOutcome.Waiting)
        assertThat(
            CallReliabilityPolicy.evaluateHalfOpen(inboundPackets = 4, outboundPackets = 1, secondsInConnected = 4.0),
        ).isEqualTo(HalfOpenOutcome.HealHalfOpen)
    }

    // --- evaluateConnecting ----------------------------------------------------

    @Test
    fun `connecting inside both budgets keeps waiting`() {
        val outcome = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting = 11.9,
            didAttemptRestart = false,
            restartAfterSeconds = 12.0,
            failAfterSeconds = 25.0,
        )
        assertThat(outcome).isEqualTo(ConnectingOutcome.Waiting)
    }

    @Test
    fun `connecting past the restart budget triggers one ICE restart`() {
        val outcome = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting = 12.0,
            didAttemptRestart = false,
            restartAfterSeconds = 12.0,
            failAfterSeconds = 25.0,
        )
        assertThat(outcome).isEqualTo(ConnectingOutcome.RestartIce)
    }

    @Test
    fun `a second restart is not attempted while still inside the fail budget`() {
        val outcome = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting = 20.0,
            didAttemptRestart = true,
            restartAfterSeconds = 12.0,
            failAfterSeconds = 25.0,
        )
        assertThat(outcome).isEqualTo(ConnectingOutcome.Waiting)
    }

    @Test
    fun `connecting past the fail budget fails the call`() {
        val outcome = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting = 25.0,
            didAttemptRestart = false,
            restartAfterSeconds = 12.0,
            failAfterSeconds = 25.0,
        )
        assertThat(outcome).isEqualTo(ConnectingOutcome.Fail)
    }

    @Test
    fun `the fail budget takes priority even when a restart was never attempted`() {
        val outcome = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting = 30.0,
            didAttemptRestart = true,
            restartAfterSeconds = 12.0,
            failAfterSeconds = 25.0,
        )
        assertThat(outcome).isEqualTo(ConnectingOutcome.Fail)
    }

    @Test
    fun `connecting defaults pin the iOS twelve and twenty-five second budgets`() {
        assertThat(CallReliabilityPolicy.evaluateConnecting(secondsInConnecting = 12.0, didAttemptRestart = false))
            .isEqualTo(ConnectingOutcome.RestartIce)
        assertThat(CallReliabilityPolicy.evaluateConnecting(secondsInConnecting = 25.0, didAttemptRestart = true))
            .isEqualTo(ConnectingOutcome.Fail)
        assertThat(CallReliabilityPolicy.evaluateConnecting(secondsInConnecting = 11.99, didAttemptRestart = false))
            .isEqualTo(ConnectingOutcome.Waiting)
    }

    // --- evaluateReconnecting --------------------------------------------------

    @Test
    fun `a reconnect attempt inside its budget keeps waiting`() {
        assertThat(CallReliabilityPolicy.evaluateReconnecting(secondsInAttempt = 9.99, budgetSeconds = 10.0))
            .isEqualTo(ReconnectingOutcome.Waiting)
    }

    @Test
    fun `a reconnect attempt that overruns its budget escalates`() {
        assertThat(CallReliabilityPolicy.evaluateReconnecting(secondsInAttempt = 10.0, budgetSeconds = 10.0))
            .isEqualTo(ReconnectingOutcome.Retry)
    }

    @Test
    fun `reconnecting default pins the iOS ten second attempt budget`() {
        assertThat(CallReliabilityPolicy.evaluateReconnecting(secondsInAttempt = 10.0))
            .isEqualTo(ReconnectingOutcome.Retry)
        assertThat(CallReliabilityPolicy.evaluateReconnecting(secondsInAttempt = 9.99))
            .isEqualTo(ReconnectingOutcome.Waiting)
    }

    // --- evaluateReconnectTrigger ----------------------------------------------

    @Test
    fun `the first trigger for an idle call starts a reconnection cycle`() {
        assertThat(
            CallReliabilityPolicy.evaluateReconnectTrigger(isAlreadyReconnecting = false, isEscalation = false),
        ).isEqualTo(ReconnectTriggerOutcome.StartCycle)
    }

    @Test
    fun `a trigger while a cycle is in flight coalesces instead of advancing the budget`() {
        assertThat(
            CallReliabilityPolicy.evaluateReconnectTrigger(isAlreadyReconnecting = true, isEscalation = false),
        ).isEqualTo(ReconnectTriggerOutcome.Coalesce)
    }

    @Test
    fun `an escalation always advances the budget regardless of cycle state`() {
        assertThat(
            CallReliabilityPolicy.evaluateReconnectTrigger(isAlreadyReconnecting = true, isEscalation = true),
        ).isEqualTo(ReconnectTriggerOutcome.Escalate)
        assertThat(
            CallReliabilityPolicy.evaluateReconnectTrigger(isAlreadyReconnecting = false, isEscalation = true),
        ).isEqualTo(ReconnectTriggerOutcome.Escalate)
    }

    // --- reconnectingAllowed ---------------------------------------------------

    @Test
    fun `reconnecting is allowed once media negotiation has begun`() {
        assertThat(CallReliabilityPolicy.reconnectingAllowed(CallState.Connecting)).isTrue()
        assertThat(CallReliabilityPolicy.reconnectingAllowed(CallState.Connected)).isTrue()
        assertThat(CallReliabilityPolicy.reconnectingAllowed(CallState.Reconnecting(attempt = 2))).isTrue()
    }

    @Test
    fun `reconnecting is forbidden before an answer and after the call ends`() {
        assertThat(CallReliabilityPolicy.reconnectingAllowed(CallState.Idle)).isFalse()
        assertThat(CallReliabilityPolicy.reconnectingAllowed(CallState.Ringing(isOutgoing = true))).isFalse()
        assertThat(CallReliabilityPolicy.reconnectingAllowed(CallState.Ringing(isOutgoing = false))).isFalse()
        assertThat(CallReliabilityPolicy.reconnectingAllowed(CallState.Offering)).isFalse()
        assertThat(CallReliabilityPolicy.reconnectingAllowed(CallState.Ended(CallEndReason.Local))).isFalse()
    }

    // --- shouldRearmRestartOnCredentialRefresh ---------------------------------

    @Test
    fun `a credential refresh re-arms the restart only mid-reconnect`() {
        assertThat(CallReliabilityPolicy.shouldRearmRestartOnCredentialRefresh(CallState.Reconnecting(attempt = 1)))
            .isTrue()
    }

    @Test
    fun `a credential refresh is inert on every non-reconnecting phase`() {
        assertThat(CallReliabilityPolicy.shouldRearmRestartOnCredentialRefresh(CallState.Idle)).isFalse()
        assertThat(CallReliabilityPolicy.shouldRearmRestartOnCredentialRefresh(CallState.Ringing(isOutgoing = true)))
            .isFalse()
        assertThat(CallReliabilityPolicy.shouldRearmRestartOnCredentialRefresh(CallState.Offering)).isFalse()
        assertThat(CallReliabilityPolicy.shouldRearmRestartOnCredentialRefresh(CallState.Connecting)).isFalse()
        assertThat(CallReliabilityPolicy.shouldRearmRestartOnCredentialRefresh(CallState.Connected)).isFalse()
        assertThat(
            CallReliabilityPolicy.shouldRearmRestartOnCredentialRefresh(CallState.Ended(CallEndReason.ConnectionLost)),
        ).isFalse()
    }

    // --- shouldResetCallClock --------------------------------------------------

    @Test
    fun `a fresh connect resets the call clock whether or not a start date exists`() {
        assertThat(CallReliabilityPolicy.shouldResetCallClock(wasReconnecting = false, hasExistingStartDate = false))
            .isTrue()
        assertThat(CallReliabilityPolicy.shouldResetCallClock(wasReconnecting = false, hasExistingStartDate = true))
            .isTrue()
    }

    @Test
    fun `a first-ever connect that transited through reconnecting still resets the clock`() {
        assertThat(CallReliabilityPolicy.shouldResetCallClock(wasReconnecting = true, hasExistingStartDate = false))
            .isTrue()
    }

    @Test
    fun `a genuine mid-call reconnect preserves the running clock`() {
        assertThat(CallReliabilityPolicy.shouldResetCallClock(wasReconnecting = true, hasExistingStartDate = true))
            .isFalse()
    }
}
