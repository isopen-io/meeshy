package me.meeshy.sdk.call

import android.content.Context
import android.media.projection.MediaProjection
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.screen.ScreenFeed
import org.junit.Test
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.IceCandidate
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpParameters.DegradationPreference
import org.webrtc.RtpSender
import org.webrtc.RtpTransceiver
import org.webrtc.RtpTransceiver.RtpTransceiverDirection
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack
import org.webrtc.initialDirection
import org.webrtc.rtpEncoding
import org.webrtc.rtpParameters

/**
 * L'écran partagé part sur CHAQUE connexion d'un appel de groupe (#13755), pas seulement vers le pair de l'appel :
 * chaque lien du maillage remplace la piste de son émetteur vidéo (aucune offre quand il émettait déjà, une offre
 * quand il ne faisait que recevoir), l'encode comme un écran, puis rend ce qu'il portait à l'arrêt. Un lien ouvert
 * pendant le partage porte l'écran dès son offre.
 */
class WebRtcEngineMeshScreenShareTest {

    private class Rig(meshVideoDirection: RtpTransceiverDirection?) {
        val screenTrack: VideoTrack = mockk(relaxed = true) { every { id() } returns "meeshy_screen" }
        var meshEncoding = rtpParameters(DegradationPreference.MAINTAIN_FRAMERATE, listOf(rtpEncoding(600_000, 20, 1.5)))
        val meshSender: RtpSender = mockk(relaxed = true) {
            every { track() } returns null
            every { parameters } answers { meshEncoding }
            every { setParameters(any()) } answers {
                meshEncoding = firstArg()
                true
            }
        }
        var meshDirection = meshVideoDirection
        val meshVideo: RtpTransceiver = mockk(relaxed = true) {
            every { mediaType } returns MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO
            every { direction } answers { meshDirection }
            every { setDirection(any()) } answers {
                meshDirection = firstArg()
                true
            }
            every { sender } returns meshSender
        }
        val addedInit = slot<RtpTransceiver.RtpTransceiverInit>()
        val mesh: PeerConnection = mockk(relaxed = true) {
            every { transceivers } answers { if (meshDirection == null) emptyList() else listOf(meshVideo) }
            every { addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO, capture(addedInit)) } answers {
                meshDirection = addedInit.captured.initialDirection()
                meshVideo
            }
            every { createOffer(any(), any()) } answers {
                firstArg<SdpObserver>().onCreateSuccess(SessionDescription(SessionDescription.Type.OFFER, "v=0"))
            }
        }
        val primarySender: RtpSender = mockk(relaxed = true)
        val primary: PeerConnection = mockk(relaxed = true) {
            every { transceivers } returns listOf(
                mockk(relaxed = true) {
                    every { mediaType } returns MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO
                    every { direction } returns RtpTransceiverDirection.SEND_RECV
                    every { sender } returns primarySender
                    every { isStopped } returns false
                },
            )
        }
        val factory: PeerConnectionFactory = mockk(relaxed = true) {
            every { createAudioSource(any()) } returns mockk<AudioSource>(relaxed = true)
            every { createAudioTrack(any(), any()) } returns mockk<AudioTrack>(relaxed = true)
            every { createPeerConnection(any<PeerConnection.RTCConfiguration>(), any<PeerConnection.Observer>()) } returnsMany listOf(primary, mesh)
        }
        val engine = WebRtcEngine(
            appContext = mockk<Context>(relaxed = true),
            stackProvider = { WebRtcStack(InertEglBase(), factory) },
            activityGate = CallActivityGate(),
            screenFeeds = { _ -> ScreenFeed(screenTrack) {} },
        )
        var renegotiations = 0
        val listener = object : CallMeshPeerListener {
            override fun onIceCandidate(candidate: IceCandidate) = Unit
            override fun onConnectionChange(state: PeerConnection.PeerConnectionState) = Unit
            override fun onRemoteVideo(track: VideoTrack) = Unit
            override fun onRenegotiationNeeded() {
                renegotiations += 1
            }
        }
        val projection: MediaProjection = mockk(relaxed = true)

        fun openMesh(): CallMeshPeer =
            engine.openMeshPeer(CallMeshPeerConfig(emptyList(), sendsAudio = true, sendsVideo = false), listener)
    }

    @Test
    fun `a sending mesh link takes the screen without an offer, encodes it as a screen, then gives it back`() {
        val rig = Rig(RtpTransceiverDirection.SEND_RECV)
        rig.engine.createConnection(emptyList())
        rig.openMesh()
        val before = rig.meshEncoding.encodings.single().maxBitrateBps

        rig.engine.beginScreenShare(rig.projection)

        verify { rig.meshSender.setTrack(rig.screenTrack, false) }
        assertThat(rig.meshEncoding.degradationPreference).isEqualTo(DegradationPreference.MAINTAIN_RESOLUTION)
        assertThat(rig.meshEncoding.encodings.single().maxFramerate).isEqualTo(15)
        rig.engine.endScreenShare()

        verify { rig.meshSender.setTrack(null, false) }
        assertThat(rig.meshEncoding.encodings.single().maxBitrateBps).isEqualTo(before)
        assertThat(rig.meshDirection).isEqualTo(RtpTransceiverDirection.SEND_RECV)
        assertThat(rig.renegotiations).isEqualTo(0)
    }

    @Test
    fun `a receive-only mesh link starts sending and offers, then goes back to receiving and offers again`() {
        val rig = Rig(RtpTransceiverDirection.RECV_ONLY)
        rig.engine.createConnection(emptyList())
        rig.openMesh()

        rig.engine.beginScreenShare(rig.projection)

        assertThat(rig.meshDirection).isEqualTo(RtpTransceiverDirection.SEND_RECV)
        assertThat(rig.renegotiations).isEqualTo(1)
        rig.engine.endScreenShare()

        assertThat(rig.meshDirection).isEqualTo(RtpTransceiverDirection.RECV_ONLY)
        assertThat(rig.renegotiations).isEqualTo(2)
    }

    @Test
    fun `a mesh link opened during the share offers the screen`() = runTest {
        val rig = Rig(meshVideoDirection = null)
        rig.engine.createConnection(emptyList())
        rig.engine.beginScreenShare(rig.projection)

        rig.openMesh().createOffer()

        assertThat(rig.addedInit.captured.initialDirection()).isEqualTo(RtpTransceiverDirection.SEND_RECV)
        verify { rig.meshSender.setTrack(rig.screenTrack, false) }
        assertThat(rig.renegotiations).isEqualTo(0)
    }
}
