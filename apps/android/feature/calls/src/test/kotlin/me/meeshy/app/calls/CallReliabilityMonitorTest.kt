package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallStateMachine
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallReliabilityMonitorTest {

    private class FakeHost(override val scope: CoroutineScope, initial: CallState) : CallSessionHost {
        override var callState: CallState = initial
        override val config: CallConfig = CallConfig.EMPTY
        override val callId = "call-1"
        override val selfId = "me"
        override val elapsedSeconds = 0L
        val events = mutableListOf<CallEvent>()
        var mediaEnded = 0
        override fun dispatch(event: CallEvent) {
            events += event
            callState = CallStateMachine.reduce(callState, event)
        }
        override fun endMedia() { mediaEnded += 1 }
        override fun restartMediaIce() = Unit
        override fun publish() = Unit
    }

    private class FakeMedia : CallReliabilityMedia {
        var connected = false
        var awaitingOffer = false
        var counts: CallPacketCounts? = CallPacketCounts(0, 0)
        var restarts = 0
        var cycles = 0
        var caughtUp = 0
        override val peerConnected get() = connected
        override val awaitingRemoteOffer get() = awaitingOffer
        override suspend fun packetCounts() = counts
        override fun beginReconnectCycle() { cycles += 1 }
        override fun catchUpConnected() { caughtUp += 1 }
        override fun restartIceNow() { restarts += 1 }
    }

    private val signals: CallSignalManager = mockk(relaxed = true)

    private fun TestScope.monitorFor(host: FakeHost, media: FakeMedia): CallReliabilityMonitor {
        val monitor = CallReliabilityMonitor(
            clock = object : CallClock { override fun nowMs() = testScheduler.currentTime },
            signals = signals,
            trigger = CallReconnectionTrigger(signals),
            intervalMs = 2_000,
        )
        monitor.onTransition(host.callState)
        monitor.start(host, media)
        return monitor
    }

    @Test
    fun `outbound flowing but inbound stalled in Connected triggers exactly one ICE restart`() = runTest {
        val host = FakeHost(backgroundScope, CallState.Connected)
        val media = FakeMedia()
        monitorFor(host, media)

        // The first tick arms the epoch baseline, then the grace (4 s) must elapse.
        listOf(2_000, 4_000, 6_000, 8_000).forEach { at ->
            media.counts = CallPacketCounts(inbound = 0, outbound = at / 20)
            advanceTimeBy(2_000)
            runCurrent()
        }

        assertThat(host.events).containsExactly(CallEvent.ConnectionStalled)
        assertThat(media.restarts).isEqualTo(1)
        assertThat(media.cycles).isEqualTo(1)
    }

    @Test
    fun `a two-way link is left alone`() = runTest {
        val host = FakeHost(backgroundScope, CallState.Connected)
        val media = FakeMedia()
        monitorFor(host, media)

        repeat(6) { n ->
            media.counts = CallPacketCounts(inbound = n * 50, outbound = n * 50)
            advanceTimeBy(2_000)
            runCurrent()
        }

        assertThat(host.events).isEmpty()
        assertThat(media.restarts).isEqualTo(0)
    }

    @Test
    fun `a connecting call whose peer is already connected is caught up instead of restarted`() = runTest {
        val host = FakeHost(backgroundScope, CallState.Connecting)
        val media = FakeMedia().apply { connected = true }
        monitorFor(host, media)

        advanceTimeBy(2_000)
        runCurrent()

        assertThat(media.caughtUp).isEqualTo(1)
        assertThat(media.restarts).isEqualTo(0)
    }

    @Test
    fun `a wedged connecting call gets one ICE restart then fails with the call ended on the wire`() = runTest {
        val host = FakeHost(backgroundScope, CallState.Connecting)
        val media = FakeMedia()
        monitorFor(host, media)

        // The first tick (t = 2 s) starts the ICE clock: restart at +12 s (t = 14 s); the 25 s budget is first
        // seen spent on the 2 s grid at t = 28 s (+26 s) — t = 27 s is no tick.
        advanceTimeBy(14_000)
        runCurrent()
        assertThat(media.restarts).isEqualTo(1)
        assertThat(host.callState).isEqualTo(CallState.Connecting)

        advanceTimeBy(14_000)
        runCurrent()

        assertThat(media.restarts).isEqualTo(1)
        assertThat(host.callState).isInstanceOf(CallState.Ended::class.java)
        verify(exactly = 1) { signals.emitEnd("call-1") }
        assertThat(host.mediaEnded).isEqualTo(1)
    }

    @Test
    fun `a callee still waiting for the remote offer is never failed by the ICE clock`() = runTest {
        val host = FakeHost(backgroundScope, CallState.Connecting)
        val media = FakeMedia().apply { awaitingOffer = true }
        monitorFor(host, media)

        advanceTimeBy(60_000)
        runCurrent()

        assertThat(host.callState).isEqualTo(CallState.Connecting)
        assertThat(media.restarts).isEqualTo(0)
    }

    @Test
    fun `an offering call is not supervised`() = runTest {
        val host = FakeHost(backgroundScope, CallState.Offering)
        val media = FakeMedia()
        monitorFor(host, media)

        advanceTimeBy(60_000)
        runCurrent()

        assertThat(host.events).isEmpty()
        assertThat(media.restarts).isEqualTo(0)
    }

    @Test
    fun `three network beats in a row spend a single reconnection cycle`() = runTest {
        val host = FakeHost(backgroundScope, CallState.Connected)
        val media = FakeMedia()
        val trigger = CallReconnectionTrigger(signals)

        repeat(3) { trigger.request(host, media) }

        assertThat(host.events).containsExactly(CallEvent.ConnectionStalled)
        assertThat(host.callState).isEqualTo(CallState.Reconnecting(1))
        assertThat(media.cycles).isEqualTo(1)
        assertThat(media.restarts).isEqualTo(3)
    }

    @Test
    fun `no reconnection is requested before the answer`() = runTest {
        val media = FakeMedia()
        val trigger = CallReconnectionTrigger(signals)
        listOf(CallState.Ringing(isOutgoing = true), CallState.Offering, CallState.Idle).forEach { state ->
            trigger.request(FakeHost(backgroundScope, state), media)
        }

        assertThat(media.restarts).isEqualTo(0)
    }
}
