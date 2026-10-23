package me.meeshy.sdk.call

import android.content.Context
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraEnumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.MediaConstraints
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.RtpTransceiver
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

/**
 * Les sources MÉDIA LOCALES d'un appel : micro, caméra et leurs pistes. Rien n'est créé avant
 * [attachAudio] / [attachVideo] (donc jamais avant le premier appel : la pile WebRTC est paresseuse)
 * et [release] rend tout, pour que le singleton moteur serve l'appel suivant à neuf.
 */
internal class CallMediaSources(
    private val appContext: Context,
    private val stack: Lazy<WebRtcStack>,
) {
    private var audioSource: AudioSource? = null
    private var localAudioTrack: AudioTrack? = null
    private var videoCapturer: CameraVideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null

    /** La piste d'aperçu caméra, présente seulement pendant une capture vidéo. */
    var localVideoTrack: VideoTrack? = null
        private set

    private var audioAttached = false
    private var videoAttached = false

    /** Crée le micro (écho, bruit et gain traités) SANS le poser sur un pair : le moment de l'attache dépend du rôle. */
    fun prepareAudio() {
        if (localAudioTrack != null) return
        val factory = stack.value.factory
        val source = factory.createAudioSource(audioConstraints())
        audioSource = source
        localAudioTrack = factory.createAudioTrack(AUDIO_TRACK_ID, source)
    }

    /** Démarre la caméra et crée sa piste, SANS la poser sur un pair. Sans caméra : appel audio seul. */
    fun prepareVideo() {
        if (localVideoTrack != null) return
        val capturer = createCameraCapturer() ?: return
        val current = stack.value
        val helper = SurfaceTextureHelper.create("MeeshyCapture", current.eglBase.eglBaseContext)
        val source = current.factory.createVideoSource(false)
        capturer.initialize(helper, appContext, source.capturerObserver)
        capturer.startCapture(CAPTURE_WIDTH, CAPTURE_HEIGHT, CAPTURE_FPS)
        videoCapturer = capturer
        videoSource = source
        surfaceTextureHelper = helper
        localVideoTrack = current.factory.createVideoTrack(VIDEO_TRACK_ID, source)
    }

    /**
     * Offreur : les pistes entrent par `addTrack`, qui crée les transceivers de l'offre. À appeler au
     * `createOffer`, jamais avant : poser les transceivers à l'ouverture du pair rendait la réponse du
     * répondeur recvonly (média à sens unique).
     */
    fun attachForOffer(peer: PeerConnection) {
        if (!audioAttached) {
            localAudioTrack?.let { peer.addTrack(it, listOf(STREAM_ID)); audioAttached = true }
        }
        if (!videoAttached) {
            localVideoTrack?.let { peer.addTrack(it, listOf(STREAM_ID)); videoAttached = true }
        }
    }

    /**
     * Répondeur : APRÈS `setRemoteDescription`, libwebrtc a créé les transceivers récepteurs des sections
     * de l'offre. On y accroche nos pistes et on force `sendrecv`, pour que la réponse annonce l'envoi sur
     * les sections que l'appelant lit. Sans transceiver audio correspondant, repli par `addTrack`.
     */
    fun attachForAnswer(peer: PeerConnection) {
        val transceivers = peer.transceivers
        if (!audioAttached) {
            localAudioTrack?.let { track ->
                if (adopt(transceivers, MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO, track) == null) {
                    peer.addTrack(track, listOf(STREAM_ID))
                }
                audioAttached = true
            }
        }
        if (!videoAttached) {
            localVideoTrack?.let { track ->
                adopt(transceivers, MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO, track)?.also { videoAttached = true }
            }
        }
    }

    private fun adopt(
        transceivers: List<RtpTransceiver>,
        type: MediaStreamTrack.MediaType,
        track: MediaStreamTrack,
    ): RtpTransceiver? {
        val target = transceivers.firstOrNull { it.mediaType == type && it.sender.track() == null } ?: return null
        target.sender.setTrack(track, false)
        target.setDirection(RtpTransceiver.RtpTransceiverDirection.SEND_RECV)
        return target
    }

    private fun audioConstraints(): MediaConstraints = MediaConstraints().apply {
        listOf("googEchoCancellation", "googNoiseSuppression", "googAutoGainControl", "googHighpassFilter")
            .forEach { optional.add(MediaConstraints.KeyValuePair(it, "true")) }
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
        runCatching {
            if (enabled) videoCapturer?.startCapture(CAPTURE_WIDTH, CAPTURE_HEIGHT, CAPTURE_FPS)
            else videoCapturer?.stopCapture()
        }
    }

    /** Arrête la capture et dispose les sources ; à appeler AVANT de disposer le `PeerConnection`. */
    fun releaseVideo() {
        runCatching { videoCapturer?.stopCapture() }
        videoCapturer?.dispose()
        surfaceTextureHelper?.dispose()
        localVideoTrack?.dispose()
        videoSource?.dispose()
        videoCapturer = null
        surfaceTextureHelper = null
        localVideoTrack = null
        videoSource = null
        videoAttached = false
    }

    /** À appeler APRÈS avoir disposé le `PeerConnection`. */
    fun releaseAudio() {
        localAudioTrack?.dispose()
        audioSource?.dispose()
        localAudioTrack = null
        audioSource = null
        audioAttached = false
    }

    private companion object {
        const val AUDIO_TRACK_ID = "meeshy_audio"
        const val VIDEO_TRACK_ID = "meeshy_video"
        const val STREAM_ID = "meeshy_stream"
        const val CAPTURE_WIDTH = 1280
        const val CAPTURE_HEIGHT = 720
        const val CAPTURE_FPS = 30
    }
}
