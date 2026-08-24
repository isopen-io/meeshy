package me.meeshy.app.calls

import android.content.Context
import android.media.AudioManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.match
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.CallSignalPayload
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Before
import org.junit.Test
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection.IceConnectionState
import org.webrtc.SessionDescription

/**
 * Behavioural spec de la politique de reconnexion mid-call du coordinateur —
 * le maillon résilience réseau qui manquait (un handoff WiFi→LTE figeait le
 * média Android pour toujours, l'appel restant « actif » côté serveur) :
 *
 *  - DISCONNECTED mid-call = stall transitoire : FSM Reconnecting (callback)
 *    + `call:reconnecting` (grâce serveur), SANS restart ICE.
 *  - FAILED mid-call = stall + restart ICE ; l'APPELANT INITIAL seul renégocie
 *    (offre fraîche, negotiationId incrémenté) — anti-glare.
 *  - Retour CONNECTED après un stall = `call:reconnected` + MediaConnected.
 *  - L'ICE pré-connexion (checking initial) n'est jamais un stall — c'est la
 *    phase Connecting de la FSM.
 *
 * L'engine et la signalisation sont mockés ; les transitions ICE sont pilotées
 * par un StateFlow — aucun natif WebRTC n'est exécuté.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class WebRtcCallCoordinatorTest {

    private val iceState = MutableStateFlow(IceConnectionState.NEW)
    private val localCandidates = MutableSharedFlow<IceCandidate>(extraBufferCapacity = 8)
    private val incomingSignals = MutableSharedFlow<CallSignalEnvelope>(extraBufferCapacity = 8)

    private val engine: WebRtcEngine = mockk(relaxed = true) {
        every { iceConnectionState } returns iceState
        every { localIceCandidates } returns localCandidates
        coEvery { createOffer() } returns SessionDescription(SessionDescription.Type.OFFER, "v=0-restart")
        coEvery { setLocalDescription(any()) } returns Unit
    }

    private val signals: CallSignalManager = mockk(relaxed = true) {
        every { incomingSignals } returns this@WebRtcCallCoordinatorTest.incomingSignals
    }

    private val audioManager: AudioManager = mockk(relaxed = true)
    private val context: Context = mockk(relaxed = true) {
        every { getSystemService(Context.AUDIO_SERVICE) } returns audioManager
    }

    private var connectedCount = 0
    private var stalledCount = 0

    private lateinit var coordinator: WebRtcCallCoordinator

    @Before
    fun setUp() {
        coordinator = WebRtcCallCoordinator(engine, signals, context)
    }

    private fun CoroutineScope.startAsCaller() = coordinator.startOutgoing(
        this, "call-9", emptyList(), peerId = "peer", selfId = "me", isVideo = false,
        onMediaConnected = { connectedCount += 1 },
        onMediaStalled = { stalledCount += 1 },
    )

    private fun CoroutineScope.startAsCallee() = coordinator.startIncoming(
        this, "call-9", emptyList(), peerId = "peer", selfId = "me", isVideo = false,
        onMediaConnected = { connectedCount += 1 },
        onMediaStalled = { stalledCount += 1 },
    )

    private fun remoteSignal(
        type: String,
        negotiationId: Int? = null,
        sdp: String? = null,
        candidate: String? = null,
    ) = CallSignalEnvelope(
        callId = "call-9",
        signal = CallSignalPayload(
            type = type,
            sdp = sdp,
            candidate = candidate,
            sdpMLineIndex = if (candidate != null) 0 else null,
            sdpMid = if (candidate != null) "0" else null,
            from = "peer",
            to = "me",
            negotiationId = negotiationId,
        ),
    )

    @Test
    fun `the first CONNECTED reports media up exactly once`() = runTest(UnconfinedTestDispatcher()) {
        startAsCaller()

        iceState.value = IceConnectionState.CONNECTED

        assertThat(connectedCount).isEqualTo(1)
        verify(exactly = 0) { signals.emitReconnected(any(), any()) }
        coordinator.end()
    }

    @Test
    fun `a pre-connection wobble is never a stall`() = runTest(UnconfinedTestDispatcher()) {
        startAsCaller()

        iceState.value = IceConnectionState.CHECKING
        iceState.value = IceConnectionState.DISCONNECTED

        assertThat(stalledCount).isEqualTo(0)
        verify(exactly = 0) { signals.emitReconnecting(any(), any(), any()) }
        coordinator.end()
    }

    @Test
    fun `a mid-call DISCONNECTED stalls without an ICE restart`() = runTest(UnconfinedTestDispatcher()) {
        startAsCaller()
        iceState.value = IceConnectionState.CONNECTED

        iceState.value = IceConnectionState.DISCONNECTED

        assertThat(stalledCount).isEqualTo(1)
        verify(exactly = 1) { signals.emitReconnecting("call-9", "me", attempt = 1) }
        verify(exactly = 0) { engine.restartIce() }
        coordinator.end()
    }

    @Test
    fun `a mid-call FAILED restarts ICE and the caller renegotiates with a fresh offer`() =
        runTest(UnconfinedTestDispatcher()) {
            startAsCaller()
            iceState.value = IceConnectionState.CONNECTED

            iceState.value = IceConnectionState.FAILED

            assertThat(stalledCount).isEqualTo(1)
            verify(exactly = 1) { engine.restartIce() }
            verify(exactly = 1) {
                signals.emitOffer("call-9", "v=0-restart", to = "peer", from = "me", negotiationId = 1)
            }
            coordinator.end()
        }

    @Test
    fun `a callee restarts ICE on FAILED but never renegotiates (anti-glare)`() =
        runTest(UnconfinedTestDispatcher()) {
            startAsCallee()
            iceState.value = IceConnectionState.CONNECTED

            iceState.value = IceConnectionState.FAILED

            verify(exactly = 1) { engine.restartIce() }
            verify(exactly = 0) { signals.emitOffer(any(), any(), any(), any(), any()) }
            coordinator.end()
        }

    @Test
    fun `a DISCONNECTED degrading to FAILED stays one stall but does restart`() =
        runTest(UnconfinedTestDispatcher()) {
            startAsCaller()
            iceState.value = IceConnectionState.CONNECTED
            iceState.value = IceConnectionState.DISCONNECTED

            iceState.value = IceConnectionState.FAILED

            assertThat(stalledCount).isEqualTo(1)
            verify(exactly = 1) { signals.emitReconnecting(any(), any(), any()) }
            verify(exactly = 1) { engine.restartIce() }
            coordinator.end()
        }

    @Test
    fun `recovery after a stall reports reconnected and media up again`() =
        runTest(UnconfinedTestDispatcher()) {
            startAsCaller()
            iceState.value = IceConnectionState.CONNECTED
            iceState.value = IceConnectionState.DISCONNECTED

            iceState.value = IceConnectionState.CONNECTED

            assertThat(connectedCount).isEqualTo(2)
            verify(exactly = 1) { signals.emitReconnected("call-9", "me") }
            coordinator.end()
        }

    @Test
    fun `retryIceRestart while stalled restarts ICE and the caller renegotiates again`() =
        runTest(UnconfinedTestDispatcher()) {
            startAsCaller()
            iceState.value = IceConnectionState.CONNECTED
            iceState.value = IceConnectionState.FAILED

            coordinator.retryIceRestart()

            verify(exactly = 2) { engine.restartIce() }
            verify(exactly = 1) {
                signals.emitOffer("call-9", "v=0-restart", to = "peer", from = "me", negotiationId = 2)
            }
            coordinator.end()
        }

    @Test
    fun `retryIceRestart outside a stall is inert`() = runTest(UnconfinedTestDispatcher()) {
        startAsCaller()
        iceState.value = IceConnectionState.CONNECTED

        coordinator.retryIceRestart()

        verify(exactly = 0) { engine.restartIce() }
        coordinator.end()
    }

    @Test
    fun `each stall cycle carries an incremented attempt`() = runTest(UnconfinedTestDispatcher()) {
        startAsCaller()
        iceState.value = IceConnectionState.CONNECTED
        iceState.value = IceConnectionState.DISCONNECTED
        iceState.value = IceConnectionState.CONNECTED

        iceState.value = IceConnectionState.DISCONNECTED

        verify(exactly = 1) { signals.emitReconnecting("call-9", "me", attempt = 1) }
        verify(exactly = 1) { signals.emitReconnecting("call-9", "me", attempt = 2) }
        coordinator.end()
    }

    @Test
    fun `the wire attempt is clamped at the gateway schema bound of 10`() =
        runTest(UnconfinedTestDispatcher()) {
            startAsCaller()
            iceState.value = IceConnectionState.CONNECTED

            // 11 cycles stall→recover : au-delà de 10 le schéma gateway (Zod)
            // rejetterait le signal en silence — le fil doit rester à 10.
            repeat(11) {
                iceState.value = IceConnectionState.DISCONNECTED
                iceState.value = IceConnectionState.CONNECTED
            }

            verify(exactly = 1) { signals.emitReconnecting("call-9", "me", attempt = 9) }
            verify(exactly = 2) { signals.emitReconnecting("call-9", "me", attempt = 10) }
            verify(exactly = 0) { signals.emitReconnecting("call-9", "me", attempt = 11) }
            coordinator.end()
        }

    // MARK: - §3.5 negotiation-epoch staleness (mirrors iOS CallManager)
    //
    // The gateway's buffered-offer replay (§4.6) and an ICE-restart racing a peer's
    // in-flight answer can both deliver a signal from an OLDER negotiation after a
    // newer one was already sent/seen. Every branch of onRemoteSignal must drop it.

    @Test
    fun `a stale offer arriving after a newer one is dropped`() = runTest(UnconfinedTestDispatcher()) {
        startAsCallee()

        incomingSignals.emit(remoteSignal("offer", negotiationId = 2, sdp = "v=0-fresh"))
        incomingSignals.emit(remoteSignal("offer", negotiationId = 1, sdp = "v=0-stale"))

        coVerify(exactly = 1) { engine.setRemoteDescription(match { it.description == "v=0-fresh" }) }
        coVerify(exactly = 0) { engine.setRemoteDescription(match { it.description == "v=0-stale" }) }
        coordinator.end()
    }

    @Test
    fun `a stale answer from before an ICE restart is dropped, the fresh one is applied`() =
        runTest(UnconfinedTestDispatcher()) {
            startAsCaller()
            iceState.value = IceConnectionState.CONNECTED
            iceState.value = IceConnectionState.FAILED // restarts: negotiationId 0 -> 1, fresh offer sent

            incomingSignals.emit(remoteSignal("answer", negotiationId = 0, sdp = "v=0-stale-answer"))
            incomingSignals.emit(remoteSignal("answer", negotiationId = 1, sdp = "v=0-fresh-answer"))

            coVerify(exactly = 0) { engine.setRemoteDescription(match { it.description == "v=0-stale-answer" }) }
            coVerify(exactly = 1) { engine.setRemoteDescription(match { it.description == "v=0-fresh-answer" }) }
            coordinator.end()
        }

    @Test
    fun `an ICE candidate from a superseded negotiation is dropped`() = runTest(UnconfinedTestDispatcher()) {
        startAsCallee()
        incomingSignals.emit(remoteSignal("offer", negotiationId = 3, sdp = "v=0-offer"))

        incomingSignals.emit(remoteSignal("ice-candidate", negotiationId = 2, candidate = "candidate:stale"))
        incomingSignals.emit(remoteSignal("ice-candidate", negotiationId = 3, candidate = "candidate:fresh"))

        verify(exactly = 0) { engine.addIceCandidate(match { it.sdp == "candidate:stale" }) }
        verify(exactly = 1) { engine.addIceCandidate(match { it.sdp == "candidate:fresh" }) }
        coordinator.end()
    }

    @Test
    fun `a signal with no negotiationId is treated as generation 0 and accepted`() =
        runTest(UnconfinedTestDispatcher()) {
            startAsCallee()

            incomingSignals.emit(remoteSignal("offer", negotiationId = null, sdp = "v=0-legacy"))

            coVerify(exactly = 1) { engine.setRemoteDescription(match { it.description == "v=0-legacy" }) }
            coordinator.end()
        }
}
