package me.meeshy.sdk.call

import android.content.Context
import android.media.projection.MediaProjection
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import me.meeshy.sdk.call.screen.ScreenFeed
import me.meeshy.sdk.model.call.CallVideoBudget
import me.meeshy.sdk.model.call.screenshare.VideoDegradation
import org.junit.Test
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.Priority
import org.webrtc.RtpParameters
import org.webrtc.RtpParameters.DegradationPreference
import org.webrtc.RtpSender
import org.webrtc.RtpTransceiver
import org.webrtc.RtpTransceiver.RtpTransceiverDirection
import org.webrtc.VideoTrack
import org.webrtc.rtpEncoding
import org.webrtc.rtpParameters

/**
 * Les paramètres de l'émetteur vidéo du pair de l'appel, comme iOS `WebRTCService.applyVideoQuality` : dans un appel de
 * groupe, le maillage lui pose sa part du débit montant (#13752) ; chaque écriture porte la priorité réseau haute.
 */
class WebRtcEngineVideoEncodingTest {

    private class Rig {
        var current: RtpParameters = rtpParameters(DegradationPreference.BALANCED, listOf(rtpEncoding(null, null, null)))
        val sender: RtpSender = mockk(relaxed = true) {
            every { track() } returns null
            every { parameters } answers { current }
            every { setParameters(any()) } answers {
                current = firstArg()
                true
            }
        }
        val peer: PeerConnection = mockk(relaxed = true) {
            every { transceivers } returns listOf(
                mockk(relaxed = true) {
                    every { mediaType } returns MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO
                    every { direction } returns RtpTransceiverDirection.SEND_RECV
                    every { sender } returns this@Rig.sender
                    every { isStopped } returns false
                },
            )
        }
        val factory: PeerConnectionFactory = mockk(relaxed = true) {
            every { createAudioSource(any()) } returns mockk<AudioSource>(relaxed = true)
            every { createAudioTrack(any(), any()) } returns mockk<AudioTrack>(relaxed = true)
            every { createPeerConnection(any<PeerConnection.RTCConfiguration>(), any<PeerConnection.Observer>()) } returns peer
        }
        val engine = WebRtcEngine(
            appContext = mockk<Context>(relaxed = true),
            stackProvider = { WebRtcStack(InertEglBase(), factory) },
            activityGate = CallActivityGate(),
            screenFeeds = { _ -> ScreenFeed(mockk<VideoTrack>(relaxed = true)) {} },
        )

        val encoding: RtpParameters.Encoding get() = current.encodings.single()
    }

    @Test
    fun `the mesh caps the primary at its share, and lifting the ceiling gives it the full camera budget back`() {
        val rig = Rig()
        rig.engine.createConnection(emptyList())
        val share = CallVideoBudget.meshLink(encodes = 3)

        rig.engine.setGroupVideoCeiling(share)

        assertThat(rig.encoding.maxBitrateBps).isEqualTo(share.maxBitrateBps)
        assertThat(rig.encoding.maxFramerate).isEqualTo(20)
        assertThat(rig.encoding.scaleResolutionDownBy).isEqualTo(2.0)
        assertThat(rig.encoding.networkPriority).isEqualTo(Priority.HIGH)
        assertThat(rig.current.degradationPreference).isEqualTo(DegradationPreference.MAINTAIN_FRAMERATE)

        rig.engine.setGroupVideoCeiling(null)

        assertThat(rig.encoding.maxBitrateBps).isEqualTo(2_500_000)
        assertThat(rig.encoding.maxFramerate).isEqualTo(30)
        assertThat(rig.encoding.scaleResolutionDownBy).isEqualTo(1.0)
    }

    @Test
    fun `the camera tier lands on the sender with a high network priority, the screen share keeps the same priority`() {
        val rig = Rig()
        rig.engine.createConnection(emptyList())

        rig.engine.setCameraVideoBudget(CallVideoBudget(400_000, 15, 2.0, VideoDegradation.MaintainFramerate))

        assertThat(rig.encoding.maxBitrateBps).isEqualTo(400_000)
        assertThat(rig.encoding.maxFramerate).isEqualTo(15)
        assertThat(rig.encoding.scaleResolutionDownBy).isEqualTo(2.0)
        assertThat(rig.encoding.networkPriority).isEqualTo(Priority.HIGH)

        rig.current = rtpParameters(DegradationPreference.BALANCED, listOf(rtpEncoding(null, null, null)))
        rig.engine.beginScreenShare(mockk<MediaProjection>(relaxed = true))
        assertThat(rig.encoding.maxFramerate).isEqualTo(15)
        assertThat(rig.encoding.networkPriority).isEqualTo(Priority.HIGH)
    }

    @Test
    fun `the survival floor is not capped by the mesh ceiling`() {
        val rig = Rig()
        rig.engine.createConnection(emptyList())
        rig.engine.setGroupVideoCeiling(CallVideoBudget.meshLink(encodes = 5))

        rig.engine.setCameraVideoBudget(CallVideoBudget.SURVIVAL_FLOOR, frozen = true)

        assertThat(rig.encoding.maxFramerate).isEqualTo(2)
        assertThat(rig.encoding.scaleResolutionDownBy).isEqualTo(2.0)
        assertThat(rig.current.degradationPreference).isEqualTo(DegradationPreference.MAINTAIN_RESOLUTION)
    }

    @Test
    fun `a ceiling set during a screen share leaves the screen encoding, and lands on the camera when it ends`() {
        val rig = Rig()
        rig.engine.createConnection(emptyList())
        rig.engine.beginScreenShare(mockk<MediaProjection>(relaxed = true))

        rig.engine.setGroupVideoCeiling(CallVideoBudget.meshLink(encodes = 2))
        assertThat(rig.encoding.maxFramerate).isEqualTo(15)

        rig.engine.endScreenShare()
        assertThat(rig.encoding.maxFramerate).isEqualTo(20)
    }
}
