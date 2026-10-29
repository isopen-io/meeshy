package me.meeshy.sdk.call

import android.content.Context
import me.meeshy.sdk.call.camera.CallCameraZoom
import me.meeshy.sdk.call.camera.CameraLensDiscovery
import me.meeshy.sdk.call.camera.CameraZoomActuator
import me.meeshy.sdk.call.camera.ZoomCropObserver
import me.meeshy.sdk.call.effects.CallDeviceConstraint
import me.meeshy.sdk.call.effects.CallVideoEffectsProcessor
import me.meeshy.sdk.call.effects.MlKitPersonSegmenter
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.camera.CameraLensClassifier
import me.meeshy.sdk.model.call.camera.CameraFacing
import me.meeshy.sdk.model.call.camera.CameraLensProbe
import me.meeshy.sdk.model.call.camera.CameraPickerLaw
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
    private var zoomObserver: ZoomCropObserver? = null
    private var openCameraName: String? = null
    private var effects: CallVideoEffectsProcessor? = null
    @Volatile private var effectsConfig: VideoFilterConfig = VideoFilterConfig.DEFAULT
    private var lensProbes: List<CameraLensProbe> = emptyList()
    private val enumerator: CameraEnumerator by lazy { Camera2Enumerator(appContext) }

    /** Le zoom de MA caméra : pincement, pastilles d'objectifs, retour à 1×. Il écrit ici, jamais ailleurs. */
    val zoom: CallCameraZoom = CallCameraZoom(object : CameraZoomActuator {
        override fun setCrop(zoom: Float, rampRate: Float?) {
            zoomObserver?.setCrop(zoom, rampRate)
        }

        override fun openLens(lensId: String) {
            reopen(lensId)
        }

        override fun openCamera(cameraId: String): Boolean {
            var opened = false
            reopen(cameraId) { done ->
                if (done) attachZoom(cameraId)
                opened = done
            }
            return opened
        }
    })

    /** La piste d'aperçu caméra, présente seulement pendant une capture vidéo. */
    var localVideoTrack: VideoTrack? = null
        private set

    /** La source micro de l'appel : un lien d'aperçu en tire SA piste ([CallPreviewPeer]), jamais la nôtre. */
    val sharedAudioSource: AudioSource? get() = audioSource

    /** La source caméra de l'appel, même usage. */
    val sharedVideoSource: VideoSource? get() = videoSource

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
        val names = enumerator.deviceNames.toList()
        lensProbes = CameraLensDiscovery.probes(appContext, names)
        val name = flipTarget(front = true) ?: flipTarget(front = false) ?: return
        val capturer = enumerator.createCapturer(name, null) ?: return
        val current = stack.value
        val helper = SurfaceTextureHelper.create("MeeshyCapture", current.eglBase.eglBaseContext)
        val source = current.factory.createVideoSource(false)
        val observer = ZoomCropObserver(source.capturerObserver)
        val constraint = CallDeviceConstraint(appContext)
        effects = CallVideoEffectsProcessor(helper.handler, MlKitPersonSegmenter(), constraint::isConstrained).also {
            it.setConfig(effectsConfig)
            source.setVideoProcessor(it)
        }
        capturer.initialize(helper, appContext, observer)
        capturer.startCapture(CAPTURE_WIDTH, CAPTURE_HEIGHT, CAPTURE_FPS)
        videoCapturer = capturer
        videoSource = source
        surfaceTextureHelper = helper
        zoomObserver = observer
        openCameraName = name
        localVideoTrack = current.factory.createVideoTrack(VIDEO_TRACK_ID, source)
        attachZoom(name)
    }

    /**
     * Rattache le zoom à la caméra [name] qui vient de s'ouvrir : ses objectifs (aucun pour une caméra branchée,
     * que seul le recadrage ne sert pas), le choix de caméra et sa face, d'où le miroir de l'aperçu.
     */
    private fun attachZoom(name: String) {
        val isExternal = lensProbes.firstOrNull { it.id == name }?.isExternal == true
        val isFront = !isExternal && enumerator.isFrontFacing(name)
        val facing = when {
            isExternal -> CameraFacing.External
            isFront -> CameraFacing.Front
            else -> CameraFacing.Back
        }
        val cameras = CameraPickerLaw.options(lensProbes)
        zoom.attach(
            profile = if (isExternal) null else CameraLensClassifier.profile(lensProbes, isFront),
            activeLensId = name,
            cameras = cameras,
            selectedCameraId = CameraPickerLaw.selectedId(cameras, lensProbes, name),
            facing = facing,
        )
    }

    /** Rouvre la capture sur la caméra [name], sur la même source : la piste, l'encodeur et le recadrage restent. */
    private fun reopen(name: String, onDone: (Boolean) -> Unit = {}) {
        val helper = surfaceTextureHelper
        val observer = zoomObserver
        if (helper == null || observer == null || name == openCameraName) return onDone(false)
        val replacement = runCatching { enumerator.createCapturer(name, null) }.getOrNull() ?: return onDone(false)
        runCatching { videoCapturer?.stopCapture() }
        videoCapturer?.dispose()
        replacement.initialize(helper, appContext, observer)
        val started = runCatching { replacement.startCapture(CAPTURE_WIDTH, CAPTURE_HEIGHT, CAPTURE_FPS) }.isSuccess
        videoCapturer = replacement
        openCameraName = name
        onDone(started)
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

    /**
     * Bascule entre la caméra avant et arrière (iOS `switchCamera`). Elle choisit la face OPPOSÉE (à
     * l'arrière, le grand-angle) : le `switchCamera` de WebRTC passe à la caméra SUIVANTE de la liste,
     * qui serait un autre objectif arrière sur un appareil à plusieurs. [onSwitched] reçoit la face
     * désormais active, ou `null` si la bascule n'a pas eu lieu (aucune capture, une seule caméra,
     * erreur du capteur). Le zoom repart à 1× sur la nouvelle face.
     */
    fun switchCamera(onSwitched: (isFront: Boolean?) -> Unit) {
        val current = openCameraName ?: return onSwitched(null)
        val goingFront = !enumerator.isFrontFacing(current)
        val target = flipTarget(goingFront) ?: return onSwitched(null)
        reopen(target) { done ->
            if (!done) return@reopen onSwitched(null)
            attachZoom(target)
            onSwitched(goingFront)
        }
    }

    private fun flipTarget(front: Boolean): String? {
        val names = enumerator.deviceNames.filter { enumerator.isFrontFacing(it) == front }
        val main = CameraLensClassifier.profile(lensProbes, front)?.lenses?.firstOrNull { it.ratio == 1f }?.id
        return main?.takeIf { it in names } ?: names.firstOrNull()
    }

    /**
     * Les effets de MA caméra (#13331), appliqués à l'image ENVOYÉE : l'autre les voit, mon aperçu aussi.
     * Gardés pour une caméra qui n'a pas encore démarré ; remis à zéro avec la vidéo, en fin d'appel.
     */
    fun setVideoEffects(config: VideoFilterConfig) {
        effectsConfig = config
        effects?.setConfig(config)
    }

    /** Arrête la capture et dispose les sources ; à appeler AVANT de disposer le `PeerConnection`. */
    fun releaseVideo() {
        runCatching { videoCapturer?.stopCapture() }
        videoCapturer?.dispose()
        videoSource?.setVideoProcessor(null)
        effects?.release()
        effects = null
        effectsConfig = VideoFilterConfig.DEFAULT
        surfaceTextureHelper?.dispose()
        localVideoTrack?.dispose()
        videoSource?.dispose()
        zoom.detach()
        videoCapturer = null
        surfaceTextureHelper = null
        zoomObserver = null
        openCameraName = null
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
