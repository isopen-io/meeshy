package me.meeshy.sdk.call.screen

import android.content.Context
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.projection.MediaProjection
import android.view.Surface
import org.webrtc.CapturerObserver
import org.webrtc.SurfaceTextureHelper
import org.webrtc.ThreadUtils
import org.webrtc.VideoCapturer
import org.webrtc.VideoFrame
import org.webrtc.VideoSink

/**
 * La capture de l'écran sur une projection DÉJÀ obtenue (#13332). `ScreenCapturerAndroid` de WebRTC
 * réclame le jeton d'accord et obtient sa propre projection ; or le jeton est à usage unique (Android 14+)
 * et c'est le service de premier plan (`MediaProjectionService`) qui la tient, rappel d'arrêt posé.
 * Celui-ci ne fait que l'écran virtuel : il ne s'arrête pas la projection, son propriétaire s'en charge.
 */
internal class CallScreenCapturer(
    private val projection: MediaProjection,
    private val densityDpi: Int,
) : VideoCapturer, VideoSink {
    private var helper: SurfaceTextureHelper? = null
    private var observer: CapturerObserver? = null
    private var display: VirtualDisplay? = null

    override fun initialize(helper: SurfaceTextureHelper, context: Context, observer: CapturerObserver) {
        this.helper = helper
        this.observer = observer
    }

    override fun startCapture(width: Int, height: Int, framerate: Int) {
        val helper = helper ?: return
        helper.setTextureSize(width, height)
        display = projection.createVirtualDisplay(
            DISPLAY_NAME,
            width,
            height,
            densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_PRESENTATION,
            Surface(helper.surfaceTexture),
            null,
            null,
        )
        observer?.onCapturerStarted(true)
        helper.startListening(this)
    }

    override fun stopCapture() {
        val helper = helper ?: return
        ThreadUtils.invokeAtFrontUninterruptibly(helper.handler) {
            helper.stopListening()
            observer?.onCapturerStopped()
            display?.release()
            display = null
        }
    }

    override fun onFrame(frame: VideoFrame) {
        observer?.onFrameCaptured(frame)
    }

    override fun changeCaptureFormat(width: Int, height: Int, framerate: Int) = Unit

    override fun dispose() {
        helper = null
        observer = null
    }

    override fun isScreencast(): Boolean = true

    private companion object {
        const val DISPLAY_NAME = "MeeshyScreenShare"
    }
}
