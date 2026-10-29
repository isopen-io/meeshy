package me.meeshy.sdk.call.screen

import android.content.Context
import android.media.projection.MediaProjection
import me.meeshy.sdk.call.WebRtcStack
import me.meeshy.sdk.model.call.WebRtcError
import me.meeshy.sdk.model.call.screenshare.ScreenShareCaptureSize
import me.meeshy.sdk.model.call.screenshare.ScreenShareSenderLaw
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.RtpTransceiver
import org.webrtc.RtpTransceiver.RtpTransceiverDirection
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoTrack

/** Le flux d'écran d'un partage : sa piste, et ce qui libère la capture, la source et la piste. */
internal class ScreenFeed(val track: VideoTrack, private val onRelease: () -> Unit) {
    fun release() = onRelease()
}

/** Ouvre le flux d'écran d'une projection vivante ; remplaçable en test (aucun natif). */
internal fun interface ScreenFeedFactory {
    fun open(projection: MediaProjection): ScreenFeed
}

/**
 * La piste « écran » sur l'émetteur vidéo de l'appel (#13332), miroir de iOS
 * `P2PWebRTCClient+ScreenShare` : elle REMPLACE la piste de l'émetteur vidéo existant — aucune ligne m=
 * de plus, donc aucune offre quand la caméra émettait — ou, sans émetteur vidéo (appel audio), en ajoute
 * un. La caméra n'est pas arrêtée et sa source garde ses effets : le flux d'écran a sa PROPRE source, que
 * les effets ne touchent jamais. L'arrêt rend la piste et la direction d'avant.
 */
internal class CallScreenShareRoute(private val feeds: ScreenFeedFactory) {
    private var feed: ScreenFeed? = null
    private var transceiver: RtpTransceiver? = null
    private var previousTrack: MediaStreamTrack? = null
    private var previousDirection: RtpTransceiverDirection? = null

    val isSharing: Boolean get() = feed != null

    /** Branche l'écran ; `true` quand le pair doit recevoir une offre. */
    fun begin(peer: PeerConnection, projection: MediaProjection, cameraTrack: VideoTrack?): Boolean {
        if (feed != null) return false
        val existing = videoTransceiver(peer, cameraTrack)
        val plan = ScreenShareSenderLaw.begin(hasVideoSender = existing != null, wasSending = existing?.direction.isSending)
        val opened = feeds.open(projection)
        val target = existing ?: peer.addTransceiver(
            MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiverDirection.SEND_RECV, listOf(STREAM_ID)),
        )
        if (target == null) {
            opened.release()
            throw WebRtcError.ConfigureFailed("no video sender for the screen share")
        }
        previousTrack = existing?.sender?.track()
        previousDirection = existing?.direction
        target.sender.setTrack(opened.track, false)
        if (existing != null) target.setDirection(RtpTransceiverDirection.SEND_RECV)
        feed = opened
        transceiver = target
        return plan.needsRenegotiation
    }

    /** Rend à l'émetteur ce qu'il portait ; `true` quand le pair doit recevoir une offre. */
    fun end(): Boolean {
        val opened = feed ?: return false
        val target = transceiver
        val before = previousDirection
        target?.sender?.setTrack(previousTrack, false)
        target?.setDirection(before ?: RtpTransceiverDirection.RECV_ONLY)
        opened.release()
        forget()
        return target != null && ScreenShareSenderLaw.end(wasSendingBefore = before.isSending).needsRenegotiation
    }

    /** Fin d'appel : le pair va disparaître, seul le flux d'écran se libère. */
    fun release() {
        feed?.release()
        forget()
    }

    private fun forget() {
        feed = null
        transceiver = null
        previousTrack = null
        previousDirection = null
    }

    private fun videoTransceiver(peer: PeerConnection, cameraTrack: VideoTrack?): RtpTransceiver? {
        val video = peer.transceivers.filter { it.mediaType == MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO && !it.isStopped }
        val cameraId = cameraTrack?.id()
        return video.firstOrNull { cameraId != null && it.sender.track()?.id() == cameraId } ?: video.firstOrNull()
    }

    private val RtpTransceiverDirection?.isSending: Boolean
        get() = this == RtpTransceiverDirection.SEND_RECV || this == RtpTransceiverDirection.SEND_ONLY

    private companion object {
        const val STREAM_ID = "meeshy_stream"
    }
}

/** Le flux d'écran réel : une source vidéo « screencast » à part, nourrie par l'écran virtuel. */
internal class CallScreenFeeds(
    private val appContext: Context,
    private val stack: Lazy<WebRtcStack>,
) : ScreenFeedFactory {
    override fun open(projection: MediaProjection): ScreenFeed {
        val current = stack.value
        val metrics = appContext.resources.displayMetrics
        val size = ScreenShareCaptureSize.fit(metrics.widthPixels, metrics.heightPixels)
        val helper = SurfaceTextureHelper.create(THREAD_NAME, current.eglBase.eglBaseContext)
        val source = current.factory.createVideoSource(true)
        val capturer = CallScreenCapturer(projection, metrics.densityDpi)
        capturer.initialize(helper, appContext, source.capturerObserver)
        val started = runCatching {
            capturer.startCapture(size.width, size.height, ScreenShareCaptureSize.FRAMES_PER_SECOND)
        }
        if (started.isFailure) {
            capturer.dispose()
            source.dispose()
            helper.dispose()
            throw WebRtcError.ConfigureFailed("screen capture refused: ${started.exceptionOrNull()?.message}")
        }
        val track = current.factory.createVideoTrack(TRACK_ID, source)
        return ScreenFeed(track) {
            runCatching { capturer.stopCapture() }
            capturer.dispose()
            track.dispose()
            source.dispose()
            helper.dispose()
        }
    }

    private companion object {
        const val THREAD_NAME = "MeeshyScreenCapture"
        const val TRACK_ID = "meeshy_screen"
    }
}
