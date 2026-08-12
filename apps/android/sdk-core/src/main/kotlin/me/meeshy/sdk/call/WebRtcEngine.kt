package me.meeshy.sdk.call

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import me.meeshy.sdk.model.call.SocketIceServer
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraEnumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * The WebRTC media engine (SDK-level, stateful) — the piece missing on Android that
 * left calls stuck on "Connecting…". Owns one [PeerConnection] per call: local mic
 * capture, SDP offer/answer, ICE. The orchestration (which SDP to emit, when) lives
 * app-side and drives this through the signaling layer ([me.meeshy.sdk.socket
 * .CallSignalManager]). Video capture/render is added in P4.
 */
@Singleton
class WebRtcEngine @Inject constructor(
    @ApplicationContext private val appContext: Context,
) {
    val eglBase: EglBase = EglBase.create()

    private val factory: PeerConnectionFactory by lazy { buildFactory() }

    private var peerConnection: PeerConnection? = null
    private var audioSource: AudioSource? = null
    private var localAudioTrack: AudioTrack? = null

    private var videoCapturer: CameraVideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null

    /** The local camera preview track, present only while a video call is capturing. */
    var localVideoTrack: VideoTrack? = null
        private set

    private val _localIceCandidates = MutableSharedFlow<IceCandidate>(extraBufferCapacity = 64)
    val localIceCandidates: SharedFlow<IceCandidate> = _localIceCandidates.asSharedFlow()

    private val _iceConnectionState = MutableStateFlow(PeerConnection.IceConnectionState.NEW)
    val iceConnectionState: StateFlow<PeerConnection.IceConnectionState> = _iceConnectionState.asStateFlow()

    private val _remoteAudioTracks = MutableSharedFlow<AudioTrack>(extraBufferCapacity = 8)
    val remoteAudioTracks: SharedFlow<AudioTrack> = _remoteAudioTracks.asSharedFlow()

    private val _remoteVideoTracks = MutableSharedFlow<VideoTrack>(replay = 1, extraBufferCapacity = 8)
    val remoteVideoTracks: SharedFlow<VideoTrack> = _remoteVideoTracks.asSharedFlow()

    /** Opens a fresh peer connection configured with the gateway's per-user ICE servers. */
    fun createConnection(iceServers: List<SocketIceServer>, enableVideo: Boolean = false) {
        close()
        val config = PeerConnection.RTCConfiguration(iceServers.map { it.toIceServer() }).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
        }
        peerConnection = factory.createPeerConnection(config, observer)
        addLocalAudio()
        if (enableVideo) addLocalVideo()
    }

    private fun addLocalAudio() {
        val source = factory.createAudioSource(MediaConstraints())
        val track = factory.createAudioTrack(AUDIO_TRACK_ID, source)
        audioSource = source
        localAudioTrack = track
        peerConnection?.addTrack(track, listOf(STREAM_ID))
    }

    private fun addLocalVideo() {
        val capturer = createCameraCapturer() ?: return
        val helper = SurfaceTextureHelper.create("MeeshyCapture", eglBase.eglBaseContext)
        val source = factory.createVideoSource(false)
        capturer.initialize(helper, appContext, source.capturerObserver)
        capturer.startCapture(CAPTURE_WIDTH, CAPTURE_HEIGHT, CAPTURE_FPS)
        val track = factory.createVideoTrack(VIDEO_TRACK_ID, source)
        videoCapturer = capturer
        videoSource = source
        surfaceTextureHelper = helper
        localVideoTrack = track
        peerConnection?.addTrack(track, listOf(STREAM_ID))
    }

    private fun createCameraCapturer(): CameraVideoCapturer? {
        val enumerator: CameraEnumerator = Camera2Enumerator(appContext)
        val names = enumerator.deviceNames
        return names.firstOrNull { enumerator.isFrontFacing(it) }?.let { enumerator.createCapturer(it, null) }
            ?: names.firstOrNull()?.let { enumerator.createCapturer(it, null) }
    }

    fun setAudioEnabled(enabled: Boolean) {
        localAudioTrack?.setEnabled(enabled)
    }

    fun setVideoEnabled(enabled: Boolean) {
        localVideoTrack?.setEnabled(enabled)
        runCatching { if (enabled) videoCapturer?.startCapture(CAPTURE_WIDTH, CAPTURE_HEIGHT, CAPTURE_FPS) else videoCapturer?.stopCapture() }
    }

    suspend fun createOffer(): SessionDescription = createSdp(isOffer = true)

    suspend fun createAnswer(): SessionDescription = createSdp(isOffer = false)

    private suspend fun createSdp(isOffer: Boolean): SessionDescription =
        suspendCancellableCoroutine { cont ->
            val pc = peerConnection ?: return@suspendCancellableCoroutine cont.resumeWithException(
                IllegalStateException("createSdp: no peer connection"),
            )
            val observer = object : SdpObserver {
                override fun onCreateSuccess(desc: SessionDescription) = cont.resume(desc)
                override fun onCreateFailure(error: String?) =
                    cont.resumeWithException(RuntimeException("createSdp failed: $error"))
                override fun onSetSuccess() = Unit
                override fun onSetFailure(error: String?) = Unit
            }
            val constraints = MediaConstraints()
            if (isOffer) pc.createOffer(observer, constraints) else pc.createAnswer(observer, constraints)
        }

    suspend fun setLocalDescription(desc: SessionDescription) = applyDescription(desc, local = true)

    suspend fun setRemoteDescription(desc: SessionDescription) = applyDescription(desc, local = false)

    private suspend fun applyDescription(desc: SessionDescription, local: Boolean): Unit =
        suspendCancellableCoroutine { cont ->
            val pc = peerConnection ?: return@suspendCancellableCoroutine cont.resumeWithException(
                IllegalStateException("setDescription: no peer connection"),
            )
            val observer = object : SdpObserver {
                override fun onCreateSuccess(desc: SessionDescription?) = Unit
                override fun onCreateFailure(error: String?) = Unit
                override fun onSetSuccess() = cont.resume(Unit)
                override fun onSetFailure(error: String?) =
                    cont.resumeWithException(RuntimeException("setDescription failed: $error"))
            }
            if (local) pc.setLocalDescription(observer, desc) else pc.setRemoteDescription(observer, desc)
        }

    fun addIceCandidate(candidate: IceCandidate) {
        peerConnection?.addIceCandidate(candidate)
    }

    /**
     * Marks the connection for an ICE restart: the next [createOffer] carries
     * fresh ufrag/pwd so the pair re-gathers candidates over the CURRENT network
     * (WiFi→LTE handoff, router reboot). Pure building block — WHEN to restart
     * (stall detection, who re-offers) is the app-side coordinator's policy.
     */
    fun restartIce() {
        peerConnection?.restartIce()
    }

    fun close() {
        runCatching { videoCapturer?.stopCapture() }
        videoCapturer?.dispose()
        surfaceTextureHelper?.dispose()
        localVideoTrack?.dispose()
        videoSource?.dispose()
        peerConnection?.dispose()
        localAudioTrack?.dispose()
        audioSource?.dispose()
        videoCapturer = null
        surfaceTextureHelper = null
        localVideoTrack = null
        videoSource = null
        peerConnection = null
        localAudioTrack = null
        audioSource = null
        _iceConnectionState.value = PeerConnection.IceConnectionState.NEW
    }

    private fun buildFactory(): PeerConnectionFactory {
        ensureGlobalInit(appContext)
        return PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
            .createPeerConnectionFactory()
    }

    private val observer = object : PeerConnection.Observer {
        override fun onIceCandidate(candidate: IceCandidate) {
            _localIceCandidates.tryEmit(candidate)
        }

        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
            _iceConnectionState.value = state
        }

        override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {
            when (val track = receiver.track()) {
                is AudioTrack -> _remoteAudioTracks.tryEmit(track)
                is VideoTrack -> _remoteVideoTracks.tryEmit(track)
                else -> Unit
            }
        }

        override fun onSignalingChange(state: PeerConnection.SignalingState?) = Unit
        override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) = Unit
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
        override fun onAddStream(stream: MediaStream?) = Unit
        override fun onRemoveStream(stream: MediaStream?) = Unit
        override fun onDataChannel(channel: DataChannel?) = Unit
        override fun onRenegotiationNeeded() = Unit
    }

    private fun SocketIceServer.toIceServer(): PeerConnection.IceServer =
        PeerConnection.IceServer.builder(urls)
            .setUsername(username.orEmpty())
            .setPassword(credential.orEmpty())
            .createIceServer()

    companion object {
        private const val AUDIO_TRACK_ID = "meeshy_audio"
        private const val VIDEO_TRACK_ID = "meeshy_video"
        private const val STREAM_ID = "meeshy_stream"
        private const val CAPTURE_WIDTH = 1280
        private const val CAPTURE_HEIGHT = 720
        private const val CAPTURE_FPS = 30

        @Volatile
        private var globalInitDone = false

        /** `PeerConnectionFactory.initialize` must run exactly once per process. */
        @Synchronized
        private fun ensureGlobalInit(context: Context) {
            if (globalInitDone) return
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(context.applicationContext)
                    .createInitializationOptions(),
            )
            globalInitDone = true
        }
    }
}
