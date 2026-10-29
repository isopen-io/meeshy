package me.meeshy.sdk.call

import android.content.Context
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallPreviewControl
import org.junit.Test
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpSender
import org.webrtc.RtpTransceiver
import org.webrtc.RtpTransceiver.RtpTransceiverDirection
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

/**
 * Le lien d'aperçu avant décroché, sur un `PeerConnection` simulé : la réception seule n'ouvre ni
 * micro ni caméra, l'appelant n'émet que ce qu'il consent par des pistes À LUI, le canal de
 * contrôle naît avec la première offre, et fermer l'appel n'emporte que l'aperçu qui émet.
 */
class CallPreviewPeerTest {

    private val validSdp = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"

    private class RecordingListener : CallPreviewPeerListener {
        val opened = mutableListOf<Unit>()
        val videos = mutableListOf<VideoTrack>()
        override fun onIceCandidate(candidate: IceCandidate) = Unit
        override fun onConnectionChange(state: PeerConnection.PeerConnectionState) = Unit
        override fun onRemoteVideo(track: VideoTrack) { videos += track }
        override fun onControlOpened() { opened += Unit }
        override fun onControlMessage(bytes: ByteArray) = Unit
    }

    private class Rig {
        val audioSender: RtpSender = mockk(relaxed = true)
        val videoSender: RtpSender = mockk(relaxed = true)
        val audioTransceiver: RtpTransceiver = mockk(relaxed = true) {
            every { mediaType } returns MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO
            every { sender } returns this@Rig.audioSender
        }
        val videoTransceiver: RtpTransceiver = mockk(relaxed = true) {
            every { mediaType } returns MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO
            every { sender } returns this@Rig.videoSender
        }
        var transceivers: List<RtpTransceiver> = emptyList()
        val channel: DataChannel = mockk(relaxed = true) {
            every { label() } returns CallPreviewControl.CHANNEL_LABEL
            every { state() } returns DataChannel.State.CONNECTING
        }
        val observer = slot<PeerConnection.Observer>()
        val peer: PeerConnection = mockk(relaxed = true) {
            every { this@mockk.transceivers } answers { this@Rig.transceivers }
            every { addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO, any<RtpTransceiver.RtpTransceiverInit>()) } answers {
                this@Rig.transceivers = this@Rig.transceivers + audioTransceiver
                audioTransceiver
            }
            every { addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO, any<RtpTransceiver.RtpTransceiverInit>()) } answers {
                this@Rig.transceivers = this@Rig.transceivers + videoTransceiver
                videoTransceiver
            }
            every { createDataChannel(any(), any()) } returns channel
            every { setRemoteDescription(any(), any()) } answers { firstArg<SdpObserver>().onSetSuccess() }
            every { setLocalDescription(any(), any()) } answers { firstArg<SdpObserver>().onSetSuccess() }
            every { createOffer(any(), any()) } answers {
                firstArg<SdpObserver>().onCreateSuccess(SessionDescription(SessionDescription.Type.OFFER, "v=0 preview"))
            }
            every { createAnswer(any(), any()) } answers {
                firstArg<SdpObserver>().onCreateSuccess(SessionDescription(SessionDescription.Type.ANSWER, "v=0 answer"))
            }
        }
        val previewAudio: AudioTrack = mockk(relaxed = true)
        val previewVideo: VideoTrack = mockk(relaxed = true)
        val callAudio: AudioTrack = mockk(relaxed = true)
        val factory: PeerConnectionFactory = mockk(relaxed = true) {
            every { createPeerConnection(any<PeerConnection.RTCConfiguration>(), capture(observer)) } returns peer
            every { createAudioSource(any()) } returns mockk<AudioSource>(relaxed = true)
            every { createAudioTrack("meeshy_audio", any()) } returns callAudio
            every { createAudioTrack("meeshy_preview_audio", any()) } returns previewAudio
            every { createVideoTrack("meeshy_preview_video", any()) } returns previewVideo
        }
        val listener = RecordingListener()

        fun peer(
            receiveOnly: Boolean,
            sendsAudio: Boolean = false,
            sendsVideo: Boolean = true,
            video: VideoSource? = mockk(relaxed = true),
        ) = CallPreviewPeer(
            factory = factory,
            config = CallPreviewPeerConfig(emptyList(), receiveOnly, sendsAudio, sendsVideo),
            listener = listener,
            audioSource = mockk(relaxed = true),
            videoSource = video,
        )

        fun remoteTrack(track: MediaStreamTrack) {
            val receiver: RtpReceiver = mockk { every { track() } returns track }
            observer.captured.onAddTrack(receiver, emptyArray())
        }
    }

    @Test
    fun `l'appele en reception seule ne cree aucune piste et rend chaque transceiver recvonly sans piste`() = runTest {
        val rig = Rig()
        val preview = rig.peer(receiveOnly = true)
        rig.transceivers = listOf(rig.audioTransceiver, rig.videoTransceiver)

        preview.setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, validSdp))

        verify(exactly = 0) { rig.factory.createAudioTrack(any(), any()) }
        verify(exactly = 0) { rig.factory.createVideoTrack(any(), any()) }
        verify(exactly = 0) { rig.peer.addTrack(any(), any()) }
        verify { rig.audioSender.setTrack(null, false) }
        verify { rig.videoSender.setTrack(null, false) }
        verify { rig.audioTransceiver.setDirection(RtpTransceiverDirection.RECV_ONLY) }
        verify { rig.videoTransceiver.setDirection(RtpTransceiverDirection.RECV_ONLY) }
    }

    @Test
    fun `l'audio recu reste muet jusqu'a ce que l'appele active le son, meme pour une piste a venir`() {
        val rig = Rig()
        val preview = rig.peer(receiveOnly = true)
        val early: AudioTrack = mockk(relaxed = true)
        val late: AudioTrack = mockk(relaxed = true)

        rig.remoteTrack(early)
        verify { early.setEnabled(false) }

        preview.setRemoteAudible(true)
        verify { early.setEnabled(true) }

        rig.remoteTrack(late)
        verify { late.setEnabled(true) }
    }

    @Test
    fun `la video recue est remise a l'ecouteur`() {
        val rig = Rig()
        rig.peer(receiveOnly = true)
        val video: VideoTrack = mockk(relaxed = true)

        rig.remoteTrack(video)

        assertThat(rig.listener.videos).containsExactly(video)
    }

    @Test
    fun `un candidat arrive avant l'offre est garde puis pose apres elle`() = runTest {
        val rig = Rig()
        val preview = rig.peer(receiveOnly = true)
        val early = IceCandidate("0", 0, "candidate:1 1 udp 1 10.0.0.1 5000 typ host")

        preview.addIceCandidate(early)
        verify(exactly = 0) { rig.peer.addIceCandidate(any<IceCandidate>()) }

        preview.setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, validSdp))
        verify(exactly = 1) { rig.peer.addIceCandidate(match<IceCandidate> { it.sdp == early.sdp }) }
    }

    @Test
    fun `l'appelant offre sa camera par une piste a lui et ne pose AUCUNE piste micro non consentie`() = runTest {
        val rig = Rig()
        val preview = rig.peer(receiveOnly = false, sendsAudio = false, sendsVideo = true)

        preview.createOffer()

        verify { rig.audioSender.setTrack(null, false) }
        verify { rig.videoSender.setTrack(rig.previewVideo, false) }
        verify(exactly = 1) { rig.peer.createDataChannel(CallPreviewControl.CHANNEL_LABEL, any()) }
        verify(exactly = 0) { rig.peer.addTrack(any(), any()) }

        preview.setSendsAudio(true)
        verify { rig.audioSender.setTrack(rig.previewAudio, false) }
        preview.setSendsVideo(false)
        verify { rig.videoSender.setTrack(null, false) }
    }

    @Test
    fun `sans camera l'appelant n'offre que la reception video`() = runTest {
        val rig = Rig()
        val preview = rig.peer(receiveOnly = false, video = null)

        preview.createOffer()

        verify {
            rig.peer.addTransceiver(
                MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
                match<RtpTransceiver.RtpTransceiverInit> { it.direction() == RtpTransceiverDirection.RECV_ONLY },
            )
        }
    }

    @Test
    fun `une seconde offre ne repose ni transceivers ni canal`() = runTest {
        val rig = Rig()
        val preview = rig.peer(receiveOnly = false)

        preview.createOffer()
        preview.createOffer()

        verify(exactly = 1) { rig.peer.addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO, any<RtpTransceiver.RtpTransceiverInit>()) }
        verify(exactly = 1) { rig.peer.createDataChannel(any(), any()) }
    }

    @Test
    fun `le canal de controle ouvert par l'appelant est adopte par l'appele et porte ses trames`() {
        val rig = Rig()
        val preview = rig.peer(receiveOnly = true)
        val observer = slot<DataChannel.Observer>()
        every { rig.channel.registerObserver(capture(observer)) } returns Unit

        rig.observer.captured.onDataChannel(rig.channel)
        every { rig.channel.state() } returns DataChannel.State.OPEN
        observer.captured.onStateChange()
        preview.sendControl(CallPreviewControl.encode(audible = true))

        assertThat(rig.listener.opened).hasSize(1)
        verify { rig.channel.send(any()) }
    }

    @Test
    fun `fermer libere le canal, le pair puis les pistes de l'apercu, une seule fois`() = runTest {
        val rig = Rig()
        val preview = rig.peer(receiveOnly = false)
        preview.createOffer()

        preview.close()
        preview.close()

        verify(exactly = 1) { rig.channel.dispose() }
        verify(exactly = 1) { rig.peer.dispose() }
        verify(exactly = 1) { rig.previewVideo.dispose() }
        verify(exactly = 1) { rig.previewAudio.dispose() }
    }

    @Test
    fun `fermer l'appel emporte l'apercu qui emet et laisse vivre celui qui ne fait que recevoir`() {
        val rig = Rig()
        val engine = WebRtcEngine(
            appContext = mockk<Context>(relaxed = true),
            stackProvider = { WebRtcStack(InertEglBase(), rig.factory) },
            activityGate = CallActivityGate(),
        )
        engine.createConnection(emptyList())
        val listener = rig.listener
        val receiving = engine.openPreviewPeer(CallPreviewPeerConfig(emptyList(), receiveOnly = true, sendsAudio = false, sendsVideo = false), listener)
        val sending = engine.openPreviewPeer(CallPreviewPeerConfig(emptyList(), receiveOnly = false, sendsAudio = true, sendsVideo = false), listener)

        assertThat(receiving.usesCallSources).isFalse()
        assertThat(sending.usesCallSources).isTrue()
        engine.close()

        verify(exactly = 1) { rig.previewAudio.dispose() }
        verify(exactly = 2) { rig.peer.dispose() }
    }

    /** `RtpTransceiverInit` ne publie pas sa direction : le témoin la lit telle que libwebrtc la recevra. */
    private fun RtpTransceiver.RtpTransceiverInit.direction(): RtpTransceiverDirection =
        javaClass.getDeclaredField("direction").apply { isAccessible = true }.get(this) as RtpTransceiverDirection
}
