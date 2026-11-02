package me.meeshy.sdk.call

import android.content.Context
import android.media.projection.MediaProjection
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.screen.ScreenFeed
import me.meeshy.sdk.model.call.CallVideoBudget
import me.meeshy.sdk.model.call.WebRtcError
import me.meeshy.sdk.model.call.screenshare.VideoDegradation
import org.junit.Assert.assertThrows
import org.junit.Test
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpParameters
import org.webrtc.RtpParameters.DegradationPreference
import org.webrtc.RtpSender
import org.webrtc.RtpTransceiver
import org.webrtc.RtpTransceiver.RtpTransceiverDirection
import org.webrtc.VideoTrack
import org.webrtc.rtpEncoding
import org.webrtc.rtpParameters

/**
 * Le partage d'écran côté moteur (#13332), comme iOS `P2PWebRTCClient+ScreenShare` : la piste d'écran
 * REMPLACE celle de l'émetteur vidéo, aucune offre quand il émettait déjà ; il n'en faut une que si la
 * direction change. L'arrêt rend la piste et la direction d'avant, et libère le flux d'écran.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class WebRtcEngineScreenShareTest {

    private class Rig(videoDirection: RtpTransceiverDirection?) {
        val cameraTrack: MediaStreamTrack = mockk(relaxed = true) { every { id() } returns "meeshy_video" }
        val screenTrack: VideoTrack = mockk(relaxed = true) { every { id() } returns "meeshy_screen" }
        var released = 0
        var opened = 0
        var encoding = Encoded(DegradationPreference.MAINTAIN_FRAMERATE, maxBitrateBps = 800_000, maxFramerate = 30, scale = 2.0)
        val sender: RtpSender = mockk(relaxed = true) {
            every { track() } returns cameraTrack
            every { parameters } answers { encoding.toParameters() }
            every { setParameters(any()) } answers {
                encoding = Encoded.of(firstArg())
                true
            }
        }
        val video: RtpTransceiver? = videoDirection?.let { direction ->
            mockk(relaxed = true) {
                every { mediaType } returns MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO
                every { this@mockk.direction } returns direction
                every { this@mockk.sender } returns this@Rig.sender
                every { isStopped } returns false
            }
        }
        val addedSender: RtpSender = mockk(relaxed = true) { every { track() } returns null }
        val added: RtpTransceiver = mockk(relaxed = true) {
            every { mediaType } returns MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO
            every { sender } returns addedSender
        }
        val peer: PeerConnection = mockk(relaxed = true) {
            every { transceivers } returns listOfNotNull(video)
            every { addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO, any()) } returns added
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
            screenFeeds = { _ ->
                opened += 1
                ScreenFeed(screenTrack) { released += 1 }
            },
        )
        val projection: MediaProjection = mockk(relaxed = true)
    }

    private data class Encoded(
        val degradation: DegradationPreference?,
        val maxBitrateBps: Int?,
        val maxFramerate: Int?,
        val scale: Double?,
    ) {
        fun toParameters(): RtpParameters = rtpParameters(degradation, listOf(rtpEncoding(maxBitrateBps, maxFramerate, scale)))

        companion object {
            fun of(parameters: RtpParameters): Encoded = parameters.encodings.single().let {
                Encoded(parameters.degradationPreference, it.maxBitrateBps, it.maxFramerate, it.scaleResolutionDownBy)
            }
        }
    }

    @Test
    fun `the screen is encoded like iOS, keeping its resolution at 15 fps, and the camera gets its current tier back`() {
        val rig = Rig(RtpTransceiverDirection.SEND_RECV)
        rig.engine.createConnection(emptyList())
        rig.engine.setCameraVideoBudget(CallVideoBudget(800_000, 20, 1.5, VideoDegradation.MaintainFramerate))

        rig.engine.beginScreenShare(rig.projection)

        assertThat(rig.encoding).isEqualTo(
            Encoded(DegradationPreference.MAINTAIN_RESOLUTION, maxBitrateBps = 2_500_000, maxFramerate = 15, scale = 1.0),
        )
        rig.engine.endScreenShare()

        assertThat(rig.encoding).isEqualTo(
            Encoded(DegradationPreference.MAINTAIN_FRAMERATE, maxBitrateBps = 800_000, maxFramerate = 20, scale = 1.5),
        )
    }

    @Test
    fun `a sending video sender takes the screen track without an offer, then gets the camera back`() =
        runTest(UnconfinedTestDispatcher()) {
            val rig = Rig(RtpTransceiverDirection.SEND_RECV)
            var offers = 0
            backgroundScope.launch { rig.engine.renegotiationRequests.collect { offers += 1 } }
            rig.engine.createConnection(emptyList())

            rig.engine.beginScreenShare(rig.projection)

            verify { rig.sender.setTrack(rig.screenTrack, false) }
            assertThat(rig.engine.isScreenSharing).isTrue()
            rig.engine.endScreenShare()

            verify { rig.sender.setTrack(rig.cameraTrack, false) }
            verify(exactly = 0) { rig.peer.addTransceiver(any<MediaStreamTrack.MediaType>(), any()) }
            assertThat(offers).isEqualTo(0)
            assertThat(rig.released).isEqualTo(1)
            assertThat(rig.engine.isScreenSharing).isFalse()
        }

    @Test
    fun `an audio call adds a video sender, offers, and goes back to receiving with a second offer`() =
        runTest(UnconfinedTestDispatcher()) {
            val rig = Rig(videoDirection = null)
            var offers = 0
            backgroundScope.launch { rig.engine.renegotiationRequests.collect { offers += 1 } }
            rig.engine.createConnection(emptyList())

            rig.engine.beginScreenShare(rig.projection)

            verify { rig.addedSender.setTrack(rig.screenTrack, false) }
            assertThat(offers).isEqualTo(1)
            rig.engine.endScreenShare()

            verify { rig.addedSender.setTrack(null, false) }
            verify { rig.added.setDirection(RtpTransceiverDirection.RECV_ONLY) }
            assertThat(offers).isEqualTo(2)
        }

    @Test
    fun `a receive-only video sender switches to sending and offers, then is restored`() =
        runTest(UnconfinedTestDispatcher()) {
            val rig = Rig(RtpTransceiverDirection.RECV_ONLY)
            var offers = 0
            backgroundScope.launch { rig.engine.renegotiationRequests.collect { offers += 1 } }
            rig.engine.createConnection(emptyList())

            rig.engine.beginScreenShare(rig.projection)

            verify { rig.video!!.setDirection(RtpTransceiverDirection.SEND_RECV) }
            rig.engine.endScreenShare()

            verify { rig.video!!.setDirection(RtpTransceiverDirection.RECV_ONLY) }
            assertThat(offers).isEqualTo(2)
        }

    @Test
    fun `sharing twice opens one screen feed`() {
        val rig = Rig(RtpTransceiverDirection.SEND_RECV)
        rig.engine.createConnection(emptyList())

        rig.engine.beginScreenShare(rig.projection)
        rig.engine.beginScreenShare(rig.projection)

        assertThat(rig.opened).isEqualTo(1)
    }

    @Test
    fun `without a peer nothing is captured`() {
        val rig = Rig(RtpTransceiverDirection.SEND_RECV)

        assertThrows(WebRtcError.NoPeerConnection::class.java) { rig.engine.beginScreenShare(rig.projection) }
        assertThat(rig.opened).isEqualTo(0)
    }

    @Test
    fun `closing the call releases the screen feed without touching the disposed peer`() {
        val rig = Rig(RtpTransceiverDirection.SEND_RECV)
        rig.engine.createConnection(emptyList())
        rig.engine.beginScreenShare(rig.projection)

        rig.engine.close()

        assertThat(rig.released).isEqualTo(1)
        assertThat(rig.engine.isScreenSharing).isFalse()
        verify(exactly = 0) { rig.sender.setTrack(rig.cameraTrack, false) }
    }
}
