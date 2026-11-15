package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.Test
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.RtpSender
import org.webrtc.RtpTransceiver
import org.webrtc.RtpTransceiver.RtpTransceiverDirection
import org.webrtc.VideoTrack

/** Où la caméra se pose, et d'où elle part, sur un pair déjà en ligne (audio vers vidéo et retour). */
class CallMediaSourcesUpgradeTest {

    private fun transceiver(
        type: MediaStreamTrack.MediaType,
        carrying: String? = null,
        stopped: Boolean = false,
        sender: RtpSender = mockk(relaxed = true),
    ): RtpTransceiver {
        every { sender.track() } returns carrying?.let { trackId -> mockk<MediaStreamTrack>(relaxed = true) { every { id() } returns trackId } }
        return mockk(relaxed = true) {
            every { mediaType } returns type
            every { isStopped } returns stopped
            every { this@mockk.sender } returns sender
        }
    }

    private fun camera(trackId: String = "cam"): VideoTrack = mockk(relaxed = true) { every { id() } returns trackId }

    private fun peer(vararg transceivers: RtpTransceiver): PeerConnection =
        mockk(relaxed = true) { every { this@mockk.transceivers } returns transceivers.toList() }

    @Test
    fun `a free video transceiver is reused and set to send and receive`() {
        val sender = mockk<RtpSender>(relaxed = true)
        every { sender.setTrack(any(), false) } returns true
        val free = transceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO, sender = sender)
        val track = camera()

        val attached = LocalVideoRoute.attach(peer(free), track, "stream")

        assertThat(attached).isTrue()
        verify { sender.setTrack(track, false) }
        verify { free.setDirection(RtpTransceiverDirection.SEND_RECV) }
    }

    @Test
    fun `without a free video transceiver the track opens one`() {
        val audio = transceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO)
        val busy = transceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO, carrying = "screen")
        val stopped = transceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO, stopped = true)
        val peer = peer(audio, busy, stopped)
        val track = camera()
        every { peer.addTrack(track, listOf("stream")) } returns mockk<RtpSender>(relaxed = true)

        assertThat(LocalVideoRoute.attach(peer, track, "stream")).isTrue()

        verify { peer.addTrack(track, listOf("stream")) }
    }

    @Test
    fun `a pair that refuses the track reports no attachment`() {
        val peer = peer()
        val track = camera()
        every { peer.addTrack(track, any<List<String>>()) } returns null

        assertThat(LocalVideoRoute.attach(peer, track, "stream")).isFalse()
    }

    @Test
    fun `leaving video empties the camera sender and keeps receiving`() {
        val sender = mockk<RtpSender>(relaxed = true)
        val own = transceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO, carrying = "cam", sender = sender)

        val detached = LocalVideoRoute.detach(peer(own), camera("cam"))

        assertThat(detached).isTrue()
        verify { sender.setTrack(null, false) }
        verify { own.setDirection(RtpTransceiverDirection.RECV_ONLY) }
    }

    @Test
    fun `leaving video when the camera was never attached asks for no offer`() {
        val other = transceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO, carrying = "screen")

        assertThat(LocalVideoRoute.detach(peer(other), camera("cam"))).isFalse()
    }
}
