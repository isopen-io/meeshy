package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.CallPreviewPeer
import me.meeshy.sdk.call.CallPreviewPeerListener
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallSignalPayload
import me.meeshy.sdk.model.call.WebRtcError
import org.junit.Test
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection.PeerConnectionState
import org.webrtc.SessionDescription

/**
 * La négociation d'un lien d'aperçu : l'appelant ouvre l'époque 1, l'appelé répond dans l'époque
 * de l'offre, un signal d'une époque passée est écarté, et un pair que la fabrique refuse n'est
 * qu'un aperçu en moins.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class WebRtcCallPreviewLinkTest {

    private class Rig(receiveOnly: Boolean) {
        val listener = slot<CallPreviewPeerListener>()
        val peer: CallPreviewPeer = mockk(relaxed = true) {
            coEvery { createOffer() } returns SessionDescription(SessionDescription.Type.OFFER, "v=0 offer")
            coEvery { createAnswer() } returns SessionDescription(SessionDescription.Type.ANSWER, "v=0 answer")
        }
        val engine: WebRtcEngine = mockk {
            every { openPreviewPeer(any(), capture(listener)) } returns peer
        }
        val events = mutableListOf<CallPreviewLinkEvent>()
        val link = WebRtcCallPreviewLink(
            engine,
            CallPreviewLinkConfig("peer", emptyList(), receiveOnly, sendsAudio = false, sendsVideo = !receiveOnly),
            { events += it },
            UnconfinedTestDispatcher(),
        )
        val signals: List<CallPreviewLinkEvent.Signal> get() = events.filterIsInstance<CallPreviewLinkEvent.Signal>()
    }

    @Test
    fun `l'appelant offre dans l'epoque 1 et pose son offre avant de l'envoyer`() = runTest {
        val rig = Rig(receiveOnly = false)

        rig.link.offer()

        coVerify { rig.peer.setLocalDescription(match { it.type == SessionDescription.Type.OFFER }) }
        assertThat(rig.signals.single().type).isEqualTo("offer")
        assertThat(rig.signals.single().negotiationId).isEqualTo(1)
        assertThat(rig.signals.single().fields).containsEntry("sdp", "v=0 offer")
    }

    @Test
    fun `l'appele repond dans l'epoque de l'offre`() = runTest {
        val rig = Rig(receiveOnly = true)

        rig.link.receive(CallSignalPayload(type = "offer", sdp = "v=0", negotiationId = 3))

        coVerify { rig.peer.setRemoteDescription(match { it.type == SessionDescription.Type.OFFER }) }
        val answer = rig.signals.single()
        assertThat(answer.type).isEqualTo("answer")
        assertThat(answer.negotiationId).isEqualTo(3)
    }

    @Test
    fun `une reponse d'une epoque passee est ecartee, un candidat jamais`() = runTest {
        val rig = Rig(receiveOnly = false)
        rig.link.offer()
        rig.link.offer()

        rig.link.receive(CallSignalPayload(type = "answer", sdp = "v=0 stale", negotiationId = 1))
        rig.link.receive(CallSignalPayload(type = "ice-candidate", candidate = "candidate:1", sdpMid = "0", sdpMLineIndex = 0, negotiationId = 1))

        coVerify(exactly = 0) { rig.peer.setRemoteDescription(any()) }
        coVerify(exactly = 1) { rig.peer.addIceCandidate(match { it.sdp == "candidate:1" }) }
    }

    @Test
    fun `un candidat local part dans l'epoque courante`() = runTest {
        val rig = Rig(receiveOnly = false)
        rig.link.offer()

        rig.listener.captured.onIceCandidate(IceCandidate("0", 0, "candidate:local"))

        val candidate = rig.signals.last()
        assertThat(candidate.type).isEqualTo("ice-candidate")
        assertThat(candidate.negotiationId).isEqualTo(1)
        assertThat(candidate.fields).containsEntry("candidate", "candidate:local")
    }

    @Test
    fun `l'etat du pair devient connexion ou echec`() {
        val rig = Rig(receiveOnly = true)

        rig.listener.captured.onConnectionChange(PeerConnectionState.CONNECTED)
        rig.listener.captured.onConnectionChange(PeerConnectionState.FAILED)

        assertThat(rig.events).containsExactly(
            CallPreviewLinkEvent.Connection(connected = true),
            CallPreviewLinkEvent.Failed,
        ).inOrder()
    }

    @Test
    fun `un SDP refuse par libwebrtc ne remonte pas jusqu'a l'appel`() = runTest {
        val rig = Rig(receiveOnly = true)
        coEvery { rig.peer.setRemoteDescription(any()) } throws WebRtcError.SetDescriptionFailed("bad")

        rig.link.receive(CallSignalPayload(type = "offer", sdp = "v=0", negotiationId = 1))

        assertThat(rig.signals).isEmpty()
    }

    @Test
    fun `un pair que la fabrique refuse rend un echec et un lien inerte`() = runTest {
        val engine: WebRtcEngine = mockk {
            every { openPreviewPeer(any(), any()) } throws WebRtcError.ConfigureFailed("no factory")
        }
        val events = mutableListOf<CallPreviewLinkEvent>()
        val link = WebRtcCallPreviewLink(
            engine, CallPreviewLinkConfig("peer", emptyList(), true, false, false), { events += it }, UnconfinedTestDispatcher(),
        )

        link.receive(CallSignalPayload(type = "offer", sdp = "v=0", negotiationId = 1))
        link.close()

        assertThat(events).containsExactly(CallPreviewLinkEvent.Failed)
    }

    @Test
    fun `fermer le lien ferme le pair et tait ses rappels`() {
        val rig = Rig(receiveOnly = true)

        rig.link.close()
        rig.listener.captured.onConnectionChange(PeerConnectionState.CONNECTED)

        verify(exactly = 1) { rig.peer.close() }
        assertThat(rig.events).isEmpty()
    }
}
