package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.CallSignalPayload
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test
import org.webrtc.IceCandidate
import org.webrtc.SessionDescription

/** La négociation d'un appel : collisions, époque, rejeux (miroir de iOS `CallManager+Negotiation`). */
@OptIn(ExperimentalCoroutinesApi::class)
class CallNegotiatorTest {
    private class Harness(self: String, peer: String, isCaller: Boolean, scope: CoroutineScope) {
        val incoming = MutableSharedFlow<CallSignalEnvelope>(extraBufferCapacity = 16)
        val engine: WebRtcEngine = mockk(relaxed = true) {
            every { localIceCandidates } returns MutableSharedFlow<IceCandidate>()
            every { renegotiationRequests } returns MutableSharedFlow<Unit>()
            coEvery { createOffer() } returns SessionDescription(SessionDescription.Type.OFFER, "v=0 local-offer")
            coEvery { createAnswer() } returns SessionDescription(SessionDescription.Type.ANSWER, "v=0 local-answer")
        }
        val signals: CallSignalManager = mockk(relaxed = true) { every { incomingSignals } returns incoming }
        val negotiator = CallNegotiator(engine, signals).also {
            it.begin("c1", peer, self, isCaller)
            it.observe(scope)
        }

        fun remote(type: String, generation: Int?, sdp: String? = "v=0 remote") = CallSignalEnvelope(
            "c1", CallSignalPayload(type = type, sdp = sdp, from = "peer", to = "me", negotiationId = generation),
        )
    }

    private fun TestScope.callScope() = CoroutineScope(UnconfinedTestDispatcher(testScheduler) + SupervisorJob())

    @Test
    fun `an impolite peer ignores an incoming offer that collides with its own`() = runTest {
        val cs = callScope()
        val h = Harness(self = "b", peer = "a", isCaller = true, scope = cs)
        h.negotiator.onParticipantJoined(cs, "a")

        h.incoming.emit(h.remote("offer", 0))

        coVerify(exactly = 0) { h.engine.setRemoteDescription(any()) }
        verify(exactly = 0) { h.signals.emitAnswer(any(), any(), any(), any(), any()) }
        cs.cancel()
    }

    @Test
    fun `a polite peer rolls its offer back then answers the colliding one`() = runTest {
        val cs = callScope()
        val h = Harness(self = "a", peer = "b", isCaller = true, scope = cs)
        h.negotiator.onParticipantJoined(cs, "b")

        h.incoming.emit(h.remote("offer", 0))

        coVerify(exactly = 1) { h.engine.setLocalDescription(match { it.type == SessionDescription.Type.ROLLBACK }) }
        coVerify(exactly = 1) { h.engine.setRemoteDescription(match { it.description == "v=0 remote" }) }
        verify(exactly = 1) { h.signals.emitAnswer("c1", "v=0 local-answer", any(), any(), any()) }
        cs.cancel()
    }

    @Test
    fun `an exact replay of an answered offer gets the same answer without renegotiating`() = runTest {
        val cs = callScope()
        val h = Harness(self = "me", peer = "peer", isCaller = false, scope = cs)

        h.incoming.emit(h.remote("offer", 2))
        h.incoming.emit(h.remote("offer", 2))

        coVerify(exactly = 1) { h.engine.setRemoteDescription(any()) }
        coVerify(exactly = 1) { h.engine.createAnswer() }
        verify(exactly = 2) { h.signals.emitAnswer("c1", "v=0 local-answer", any(), any(), 2) }
        cs.cancel()
    }

    @Test
    fun `a signal of a lower epoch is dropped without touching the engine`() = runTest {
        val cs = callScope()
        val h = Harness(self = "me", peer = "peer", isCaller = false, scope = cs)
        h.incoming.emit(h.remote("answer", 5))

        h.incoming.emit(h.remote("answer", 3, sdp = "v=0 stale"))

        coVerify(exactly = 0) { h.engine.setRemoteDescription(match { it.description == "v=0 stale" }) }
        cs.cancel()
    }

    @Test
    fun `the first offer of a returning peer on a fresh link converges`() = runTest {
        val cs = callScope()
        val h = Harness(self = "me", peer = "peer", isCaller = false, scope = cs)
        h.incoming.emit(h.remote("offer", 6, sdp = "v=0 old-link"))

        h.incoming.emit(h.remote("offer", 1, sdp = "v=0 new-link"))

        coVerify(exactly = 1) { h.engine.setRemoteDescription(match { it.description == "v=0 new-link" }) }
        cs.cancel()
    }
}
