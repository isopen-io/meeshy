package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallNetworkEvent
import me.meeshy.sdk.model.call.CallNetworkEventKind
import me.meeshy.sdk.model.call.CallNetworkLink
import me.meeshy.sdk.model.call.CallQualityReading
import me.meeshy.sdk.model.call.CallState
import org.junit.Test
import org.webrtc.PeerConnection

/**
 * The network journal hears the call without touching it (#13676): FSM transitions, ICE state and quality readings
 * become the journal's events, written in order for the call they belong to, and nothing is heard after the end.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallNetworkJournalRecordingTest {

    private data class Written(val callId: String, val startedAtMs: Long, val events: List<CallNetworkEvent>)

    private val links = MutableStateFlow<CallNetworkLink?>(null)
    private val readings = MutableStateFlow<CallQualityReading?>(null)
    private val written = mutableListOf<Written>()
    private var clock = 1_000L

    private fun reading(loss: Double = 0.0, relayed: Boolean? = null) =
        CallQualityReading(packetLossPercent = loss, roundTripTimeMs = 40.0, jitterMs = 2.0, audioKbps = 30.0, videoKbps = 0.0, relayed = relayed)

    private val session = CallSessionInfo(callId = "call-1", config = CallConfig.EMPTY)

    private fun kinds() = written.flatMap { it.events }.map { it.kind }

    @Test
    fun `a call's link, readings, reconnection and end land in its journal, in order`() = runTest(UnconfinedTestDispatcher()) {
        val recording = CallNetworkJournalRecording(readings, links, { events, callId, startedAtMs ->
            written += Written(callId, startedAtMs, events)
        }, backgroundScope, { clock })

        recording.onTransition(CallState.Idle, CallState.Connecting, session)
        links.value = CallNetworkLink.CONNECTED
        recording.onTransition(CallState.Connecting, CallState.Connected, session)
        clock = 2_000L
        readings.value = reading(relayed = true)
        recording.onTransition(CallState.Connected, CallState.Reconnecting(attempt = 1), session)
        recording.onTransition(CallState.Reconnecting(attempt = 1), CallState.Connected, session)
        recording.onTransition(CallState.Connected, CallState.Ended(CallEndReason.Local), session)

        assertThat(written.map { it.callId }.toSet()).containsExactly("call-1")
        assertThat(written.map { it.startedAtMs }.toSet()).containsExactly(1_000L)
        assertThat(kinds().filter { it !is CallNetworkEventKind.Sample }).containsExactly(
            CallNetworkEventKind.Link("connected"),
            CallNetworkEventKind.Route(true),
            CallNetworkEventKind.Tier("excellent"),
            CallNetworkEventKind.Reconnecting(1),
            CallNetworkEventKind.Reconnected,
            CallNetworkEventKind.Ended("local"),
        ).inOrder()
        assertThat(kinds().count { it is CallNetworkEventKind.Sample }).isEqualTo(1)
    }

    @Test
    fun `nothing is heard after the call ended`() = runTest(UnconfinedTestDispatcher()) {
        val recording = CallNetworkJournalRecording(readings, links, { events, callId, startedAtMs ->
            written += Written(callId, startedAtMs, events)
        }, backgroundScope, { clock })

        recording.onTransition(CallState.Idle, CallState.Connecting, session)
        recording.onTransition(CallState.Connecting, CallState.Ended(CallEndReason.Remote), session)
        links.value = CallNetworkLink.FAILED
        readings.value = reading(loss = 20.0)

        assertThat(kinds()).containsExactly(CallNetworkEventKind.Ended("remote"))
    }

    @Test
    fun `a call without an id records nothing`() = runTest(UnconfinedTestDispatcher()) {
        val recording = CallNetworkJournalRecording(readings, links, { events, callId, startedAtMs ->
            written += Written(callId, startedAtMs, events)
        }, backgroundScope, { clock })

        recording.onTransition(CallState.Idle, CallState.Ringing(isOutgoing = true), CallSessionInfo("", CallConfig.EMPTY))
        links.value = CallNetworkLink.CONNECTED

        assertThat(written).isEmpty()
    }

    @Test
    fun `the ICE states that say something about the network are named, the others are not`() {
        assertThat(CallNetworkJournalRecording.linkOf(PeerConnection.IceConnectionState.CHECKING)).isEqualTo(CallNetworkLink.CONNECTING)
        assertThat(CallNetworkJournalRecording.linkOf(PeerConnection.IceConnectionState.COMPLETED)).isEqualTo(CallNetworkLink.CONNECTED)
        assertThat(CallNetworkJournalRecording.linkOf(PeerConnection.IceConnectionState.FAILED)).isEqualTo(CallNetworkLink.FAILED)
        assertThat(CallNetworkJournalRecording.linkOf(PeerConnection.IceConnectionState.NEW)).isNull()
        assertThat(CallNetworkJournalRecording.linkOf(PeerConnection.IceConnectionState.CLOSED)).isNull()
    }
}
