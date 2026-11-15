package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.NetworkPathSnapshot
import org.junit.Test

class CallReliabilityMonitorLawsTest {

    private val wifi = NetworkPathSnapshot(isSatisfied = true, usesWifi = true)
    private val cellular = NetworkPathSnapshot(isSatisfied = true, usesCellular = true)

    // --- HalfOpenMonitorState ---

    @Test
    fun `a stalled inbound while we send heals once after the grace`() {
        val armed = HalfOpenMonitorState().evaluate(epoch = 1, inboundPackets = 100, outboundPackets = 100, nowMs = 0)
        assertThat(armed.outcome).isEqualTo(HalfOpenOutcome.Waiting)

        val early = armed.state.evaluate(1, 100, 160, nowMs = 3_999)
        assertThat(early.outcome).isEqualTo(HalfOpenOutcome.Waiting)

        val heal = early.state.evaluate(1, 100, 200, nowMs = 4_000)
        assertThat(heal.outcome).isEqualTo(HalfOpenOutcome.HealHalfOpen)
        assertThat(heal.state.needsEvaluation(1)).isFalse()
    }

    @Test
    fun `counters are read as deltas of the epoch, never as cumulative totals`() {
        val armed = HalfOpenMonitorState().evaluate(epoch = 1, inboundPackets = 5_000, outboundPackets = 5_000, nowMs = 0)

        val step = armed.state.evaluate(1, inboundPackets = 5_002, outboundPackets = 5_300, nowMs = 5_000)

        assertThat(step.outcome).isEqualTo(HalfOpenOutcome.HealHalfOpen)
    }

    @Test
    fun `five fresh inbound packets settle the epoch as healthy`() {
        val armed = HalfOpenMonitorState().evaluate(epoch = 1, inboundPackets = 10, outboundPackets = 10, nowMs = 0)

        val step = armed.state.evaluate(1, inboundPackets = 15, outboundPackets = 40, nowMs = 1_000)

        assertThat(step.outcome).isEqualTo(HalfOpenOutcome.Healthy)
        assertThat(step.state.needsEvaluation(1)).isFalse()
        assertThat(step.state.evaluate(1, 15, 40, nowMs = 9_000).outcome).isNull()
    }

    @Test
    fun `a new epoch re-arms with a fresh baseline`() {
        val healthy = HalfOpenMonitorState()
            .evaluate(1, 0, 0, nowMs = 0).state
            .evaluate(1, 50, 50, nowMs = 1_000).state

        val rearmed = healthy.evaluate(epoch = 2, inboundPackets = 50, outboundPackets = 50, nowMs = 20_000)

        assertThat(healthy.needsEvaluation(2)).isTrue()
        assertThat(rearmed.outcome).isEqualTo(HalfOpenOutcome.Waiting)
    }

    @Test
    fun `the self-heal is spent once per call, a later stalled epoch keeps waiting`() {
        val first = HalfOpenMonitorState()
            .evaluate(1, 0, 0, nowMs = 0).state
            .evaluate(1, 0, 100, nowMs = 5_000)
        assertThat(first.outcome).isEqualTo(HalfOpenOutcome.HealHalfOpen)

        val second = first.state
            .evaluate(2, 0, 100, nowMs = 10_000).state
            .evaluate(2, 0, 300, nowMs = 20_000)

        assertThat(second.outcome).isEqualTo(HalfOpenOutcome.Waiting)
        assertThat(second.state.needsEvaluation(2)).isTrue()
    }

    // --- CallConnectedCatchUpPolicy ---

    @Test
    fun `a negotiating state whose peer is already connected catches up`() {
        assertThat(CallConnectedCatchUpPolicy.shouldCatchUp(CallState.Connecting, true)).isTrue()
        assertThat(CallConnectedCatchUpPolicy.shouldCatchUp(CallState.Reconnecting(2), true)).isTrue()
    }

    @Test
    fun `nothing catches up without a connected peer or outside negotiation`() {
        assertThat(CallConnectedCatchUpPolicy.shouldCatchUp(CallState.Connecting, false)).isFalse()
        listOf(
            CallState.Idle,
            CallState.Ringing(isOutgoing = false),
            CallState.Offering,
            CallState.Connected,
            CallState.Ended(CallEndReason.Local),
        ).forEach { assertThat(CallConnectedCatchUpPolicy.shouldCatchUp(it, true)).isFalse() }
    }

    // --- CallReliabilityWatchdog ---

    @Test
    fun `connecting gets one ICE restart at 12 s then fails at 25 s`() {
        val first = CallReliabilityWatchdog().connecting(nowMs = 0, awaitingRemoteOffer = false)
        assertThat(first.step).isEqualTo(ConnectingStep.Waiting)

        val restart = first.watchdog.connecting(nowMs = 12_000, awaitingRemoteOffer = false)
        assertThat(restart.step).isEqualTo(ConnectingStep.RestartIce(12.0))

        val still = restart.watchdog.connecting(nowMs = 20_000, awaitingRemoteOffer = false)
        assertThat(still.step).isEqualTo(ConnectingStep.Waiting)

        val fail = still.watchdog.connecting(nowMs = 25_000, awaitingRemoteOffer = false)
        assertThat(fail.step).isEqualTo(ConnectingStep.Fail(25.0))
    }

    @Test
    fun `an awaited remote offer keeps the connecting clock at zero`() {
        val waiting = CallReliabilityWatchdog().connecting(nowMs = 0, awaitingRemoteOffer = true)
        val offerArrived = waiting.watchdog.connecting(nowMs = 30_000, awaitingRemoteOffer = false)

        assertThat(offerArrived.step).isEqualTo(ConnectingStep.Waiting)
        assertThat(offerArrived.watchdog.connectingSinceMs).isEqualTo(30_000)
    }

    @Test
    fun `leaving connecting for another state drops the clock but keeps the spent restart`() {
        val spent = CallReliabilityWatchdog()
            .connecting(0, awaitingRemoteOffer = false).watchdog
            .connecting(12_000, awaitingRemoteOffer = false).watchdog

        val dropped = spent.otherState()

        assertThat(dropped.connectingSinceMs).isNull()
        assertThat(dropped.didAttemptConnectingRestart).isTrue()
        assertThat(spent.connected().didAttemptConnectingRestart).isFalse()
    }

    // --- backoff ---

    @Test
    fun `the first attempt reconnects at once, the next ones back off exponentially up to the cap`() {
        assertThat(CallReliabilityPolicy.reconnectBackoffSeconds(1, 0.5)).isEqualTo(0.0)
        assertThat(CallReliabilityPolicy.reconnectBackoffSeconds(2, 0.5)).isEqualTo(2.0)
        assertThat(CallReliabilityPolicy.reconnectBackoffSeconds(3, 0.5)).isEqualTo(4.0)
        assertThat(CallReliabilityPolicy.reconnectBackoffSeconds(9, 0.5)).isEqualTo(4.0)
    }

    @Test
    fun `the jitter spreads calls by plus or minus 15 percent around the base`() {
        assertThat(CallReliabilityPolicy.reconnectBackoffSeconds(2, 0.0)).isWithin(1e-9).of(1.7)
        assertThat(CallReliabilityPolicy.reconnectBackoffSeconds(2, 0.999999)).isWithin(1e-3).of(2.3)
    }

    // --- CallNetworkEdgeLaw ---

    @Test
    fun `losing, regaining and swapping the default network are the three edges`() {
        assertThat(CallNetworkEdgeLaw.edge(wifi, NetworkPathSnapshot.OFFLINE)).isEqualTo(CallNetworkEdge.Lost)
        assertThat(CallNetworkEdgeLaw.edge(NetworkPathSnapshot.OFFLINE, cellular)).isEqualTo(CallNetworkEdge.Restored)
        assertThat(CallNetworkEdgeLaw.edge(wifi, cellular)).isEqualTo(CallNetworkEdge.InterfaceChanged)
    }

    @Test
    fun `an unchanged or unknown interface is not an edge`() {
        assertThat(CallNetworkEdgeLaw.edge(wifi, wifi)).isNull()
        assertThat(CallNetworkEdgeLaw.edge(wifi, NetworkPathSnapshot(isSatisfied = true))).isNull()
        assertThat(CallNetworkEdgeLaw.edge(NetworkPathSnapshot.OFFLINE, NetworkPathSnapshot.OFFLINE)).isNull()
    }
}
