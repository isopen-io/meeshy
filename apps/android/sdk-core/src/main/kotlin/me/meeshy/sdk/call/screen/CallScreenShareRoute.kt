package me.meeshy.sdk.call.screen

import android.content.Context
import android.graphics.Point
import android.hardware.display.DisplayManager
import android.media.projection.MediaProjection
import android.view.Display
import me.meeshy.sdk.call.WebRtcStack
import me.meeshy.sdk.model.call.WebRtcError
import me.meeshy.sdk.model.call.screenshare.ScreenShareCaptureSize
import me.meeshy.sdk.model.call.screenshare.ScreenShareEncodingLaw
import me.meeshy.sdk.model.call.screenshare.ScreenShareSenderLaw
import me.meeshy.sdk.model.call.screenshare.SenderEncodingSnapshot
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.RtpTransceiver
import org.webrtc.RtpTransceiver.RtpTransceiverDirection
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoTrack
import timber.log.Timber

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
 * les effets ne touchent jamais. Pendant le partage, l'émetteur sert l'encodage écran d'iOS
 * ([ScreenShareEncodingLaw], #13735) ; l'arrêt rend la piste, la direction et l'encodage d'avant.
 */
internal class CallScreenShareRoute(private val feeds: ScreenFeedFactory) {
    private var feed: ScreenFeed? = null
    private var transceiver: RtpTransceiver? = null
    private var previousTrack: MediaStreamTrack? = null
    private var previousDirection: RtpTransceiverDirection? = null
    private var previousEncoding: SenderEncodingSnapshot? = null

    val isSharing: Boolean get() = feed != null

    /** La piste d'écran en cours de partage, que chaque lien du maillage porte aussi (#13755) ; `null` hors partage. */
    val track: VideoTrack? get() = feed?.track

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
        previousEncoding = encodeScreen(target)
        feed = opened
        transceiver = target
        return plan.needsRenegotiation
    }

    /** Rend à l'émetteur ce qu'il portait ; `true` quand le pair doit recevoir une offre. */
    fun end(): Boolean {
        val opened = feed ?: return false
        val target = transceiver
        val before = previousDirection
        restoreEncoding(target, previousEncoding)
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
        previousEncoding = null
    }

    private fun encodeScreen(target: RtpTransceiver): SenderEncodingSnapshot? = runCatching {
        val before = ScreenShareSenderEncoding.read(target.sender)
        ScreenShareSenderEncoding.write(target.sender, ScreenShareEncodingLaw.during(before))
        before
    }.onFailure { Timber.w(it, "Screen share encoding not applied") }.getOrNull()

    private fun restoreEncoding(target: RtpTransceiver?, before: SenderEncodingSnapshot?) {
        val sender = target?.sender ?: return
        if (before == null) return
        runCatching { ScreenShareSenderEncoding.write(sender, before) }
            .onFailure { Timber.w(it, "Camera encoding not restored after the screen share") }
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

/**
 * Le flux d'écran réel : une source vidéo « screencast » à part, nourrie par l'écran virtuel, à la taille
 * RÉELLE de l'écran (barres système comprises, c'est ce que la projection montre) et qui suit sa rotation
 * ([ScreenCaptureFollower], #13735).
 */
internal class CallScreenFeeds(
    private val appContext: Context,
    private val stack: Lazy<WebRtcStack>,
) : ScreenFeedFactory {
    override fun open(projection: MediaProjection): ScreenFeed {
        val current = stack.value
        val displays = appContext.getSystemService(DisplayManager::class.java)
        val screen = displays.realSize() ?: appContext.resources.displayMetrics.let { Point(it.widthPixels, it.heightPixels) }
        val size = ScreenShareCaptureSize.fit(screen.x, screen.y)
        val helper = SurfaceTextureHelper.create(THREAD_NAME, current.eglBase.eglBaseContext)
        val source = current.factory.createVideoSource(true)
        val capturer = CallScreenCapturer(projection, appContext.resources.displayMetrics.densityDpi)
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
        val follower = ScreenCaptureFollower(size) {
            capturer.changeCaptureFormat(it.width, it.height, ScreenShareCaptureSize.FRAMES_PER_SECOND)
        }
        val rotation = ScreenRotationListener(displays, follower)
        displays?.registerDisplayListener(rotation, helper.handler)
        val track = current.factory.createVideoTrack(TRACK_ID, source)
        return ScreenFeed(track) {
            displays?.unregisterDisplayListener(rotation)
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

/** Relit la taille réelle de l'écran principal à chaque changement, et la donne au [follower]. */
private class ScreenRotationListener(
    private val displays: DisplayManager?,
    private val follower: ScreenCaptureFollower,
) : DisplayManager.DisplayListener {
    override fun onDisplayChanged(displayId: Int) {
        if (displayId != Display.DEFAULT_DISPLAY) return
        val screen = displays.realSize() ?: return
        follower.onDisplay(screen.x, screen.y)
    }

    override fun onDisplayAdded(displayId: Int) = Unit

    override fun onDisplayRemoved(displayId: Int) = Unit
}

@Suppress("DEPRECATION")
private fun DisplayManager?.realSize(): Point? {
    val display = this?.getDisplay(Display.DEFAULT_DISPLAY) ?: return null
    return Point().also(display::getRealSize).takeIf { it.x > 0 && it.y > 0 }
}
