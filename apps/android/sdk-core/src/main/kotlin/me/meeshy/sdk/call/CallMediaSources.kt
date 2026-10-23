package me.meeshy.sdk.call

import android.content.Context
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraEnumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
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

    fun attachAudio(peer: PeerConnection) {
        val factory = stack.value.factory
        val source = factory.createAudioSource(MediaConstraints())
        val track = factory.createAudioTrack(AUDIO_TRACK_ID, source)
        audioSource = source
        localAudioTrack = track
        peer.addTrack(track, listOf(STREAM_ID))
    }

    fun attachVideo(peer: PeerConnection) {
        val capturer = createCameraCapturer() ?: return
        val current = stack.value
        val helper = SurfaceTextureHelper.create("MeeshyCapture", current.eglBase.eglBaseContext)
        val source = current.factory.createVideoSource(false)
        capturer.initialize(helper, appContext, source.capturerObserver)
        capturer.startCapture(CAPTURE_WIDTH, CAPTURE_HEIGHT, CAPTURE_FPS)
        val track = current.factory.createVideoTrack(VIDEO_TRACK_ID, source)
        videoCapturer = capturer
        videoSource = source
        surfaceTextureHelper = helper
        localVideoTrack = track
        peer.addTrack(track, listOf(STREAM_ID))
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
    }

    /** À appeler APRÈS avoir disposé le `PeerConnection`. */
    fun releaseAudio() {
        localAudioTrack?.dispose()
        audioSource?.dispose()
        localAudioTrack = null
        audioSource = null
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
