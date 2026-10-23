package me.meeshy.sdk.call

import android.content.Context
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.WebRtcError
import org.junit.Assert.assertThrows
import org.junit.Test
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpSender
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription

class WebRtcEngineHardeningTest {

    private val validSdp = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"

    private class Rig(factoryReturnsPeer: Boolean = true) {
        val audioTrack: AudioTrack = mockk(relaxed = true)
        val sender: RtpSender = mockk(relaxed = true) { every { track() } returns null }
        val transceiver: RtpTransceiver = mockk(relaxed = true) {
            every { mediaType } returns MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO
            every { this@mockk.sender } returns sender
        }
        val peer: PeerConnection = mockk(relaxed = true) {
            every { transceivers } returns listOf(transceiver)
            every { setRemoteDescription(any(), any()) } answers { firstArg<SdpObserver>().onSetSuccess() }
            every { setLocalDescription(any(), any()) } answers { firstArg<SdpObserver>().onSetSuccess() }
            every { createOffer(any(), any()) } answers {
                firstArg<SdpObserver>().onCreateSuccess(SessionDescription(SessionDescription.Type.OFFER, "v=0 offer"))
            }
            every { setConfiguration(any()) } returns true
        }
        val factory: PeerConnectionFactory = mockk(relaxed = true) {
            every { createAudioSource(any()) } returns mockk<AudioSource>(relaxed = true)
            every { createAudioTrack(any(), any()) } returns audioTrack
            every { createPeerConnection(any<PeerConnection.RTCConfiguration>(), any<PeerConnection.Observer>()) } returns
                if (factoryReturnsPeer) peer else null
        }
        val engine = WebRtcEngine(
            appContext = mockk<Context>(relaxed = true),
            stackProvider = { WebRtcStack(mockk<EglBase>(relaxed = true), factory) },
            activityGate = CallActivityGate(),
        )
    }

    @Test
    fun `ouvrir le pair n'attache aucune piste avant l'offre ou la reponse`() {
        val rig = Rig()

        rig.engine.createConnection(emptyList())

        verify(exactly = 0) { rig.peer.addTrack(any(), any()) }
    }

    @Test
    fun `l'offreur attache ses pistes a la creation de l'offre`() = runTest {
        val rig = Rig()
        rig.engine.createConnection(emptyList())

        rig.engine.createOffer()

        verify(exactly = 1) { rig.peer.addTrack(rig.audioTrack, any()) }
        rig.engine.createOffer()
        verify(exactly = 1) { rig.peer.addTrack(rig.audioTrack, any()) }
    }

    @Test
    fun `le repondeur accroche ses pistes aux transceivers APRES setRemoteDescription`() = runTest {
        val rig = Rig()
        rig.engine.createConnection(emptyList())

        rig.engine.setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, validSdp))

        verify { rig.sender.setTrack(rig.audioTrack, false) }
        verify { rig.transceiver.setDirection(RtpTransceiver.RtpTransceiverDirection.SEND_RECV) }
        verify(exactly = 0) { rig.peer.addTrack(any(), any()) }
    }

    @Test
    fun `une description distante rejouee n'est appliquee qu'une fois`() = runTest {
        val rig = Rig()
        rig.engine.createConnection(emptyList())
        val offer = SessionDescription(SessionDescription.Type.OFFER, validSdp)

        rig.engine.setRemoteDescription(offer)
        rig.engine.setRemoteDescription(offer)

        verify(exactly = 1) { rig.peer.setRemoteDescription(any(), any()) }
    }

    @Test
    fun `une reponse sans offre locale est ignoree sans echec`() = runTest {
        val rig = Rig()
        rig.engine.createConnection(emptyList())

        rig.engine.setRemoteDescription(SessionDescription(SessionDescription.Type.ANSWER, validSdp))

        verify(exactly = 0) { rig.peer.setRemoteDescription(any(), any()) }
    }

    @Test
    fun `un SDP distant invalide est refuse avec une erreur typee sans toucher le pair`() = runTest {
        val rig = Rig()
        rig.engine.createConnection(emptyList())

        val failure = runCatching {
            rig.engine.setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, "not an sdp"))
        }.exceptionOrNull()

        assertThat(failure).isInstanceOf(WebRtcError.InvalidRemoteDescription::class.java)

        verify(exactly = 0) { rig.peer.setRemoteDescription(any(), any()) }
    }

    @Test
    fun `un candidat arrive avant la description distante est garde puis applique apres elle`() = runTest {
        val rig = Rig()
        rig.engine.createConnection(emptyList())
        val early = IceCandidate("0", 0, "candidate:1 1 udp 1 10.0.0.1 5000 typ host")

        rig.engine.addIceCandidate(early)
        verify(exactly = 0) { rig.peer.addIceCandidate(any<IceCandidate>()) }

        rig.engine.setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, validSdp))

        verify(exactly = 1) { rig.peer.addIceCandidate(match<IceCandidate> { it.sdp == early.sdp }) }
    }

    @Test
    fun `un candidat hors bornes n'atteint jamais libwebrtc`() = runTest {
        val rig = Rig()
        rig.engine.createConnection(emptyList())
        rig.engine.setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, validSdp))

        rig.engine.addIceCandidate(IceCandidate("0", 999, "candidate:x"))

        verify(exactly = 0) { rig.peer.addIceCandidate(any<IceCandidate>()) }
    }

    @Test
    fun `une fabrique sans pair fait echouer l'installation avec une erreur typee`() {
        val rig = Rig(factoryReturnsPeer = false)

        assertThrows(WebRtcError.ConfigureFailed::class.java) { rig.engine.createConnection(emptyList()) }
    }

    @Test
    fun `un rafraichissement TURN en cours d'appel passe par setConfiguration`() {
        val rig = Rig()
        rig.engine.createConnection(emptyList())

        val applied = rig.engine.updateIceServers(listOf(SocketIceServer(urls = listOf("turn:turn.example:3478"), username = "u", credential = "c")))

        assertThat(applied).isTrue()
        verify(exactly = 1) { rig.peer.setConfiguration(any()) }
    }

    @Test
    fun `hors appel le rafraichissement TURN est inerte`() {
        assertThat(Rig().engine.updateIceServers(emptyList())).isFalse()
    }
}
