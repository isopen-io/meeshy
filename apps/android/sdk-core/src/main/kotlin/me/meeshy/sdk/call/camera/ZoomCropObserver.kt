package me.meeshy.sdk.call.camera

import me.meeshy.sdk.model.call.camera.CameraZoomCrop
import me.meeshy.sdk.model.call.camera.CameraZoomPolicy
import org.webrtc.CapturerObserver
import org.webrtc.VideoFrame

/**
 * Le zoom numérique de la caméra envoyée : entre la capture et la source vidéo, chaque image est
 * recadrée au centre puis remise à sa taille d'origine (l'encodeur ne voit jamais sa résolution
 * changer). Sur un tampon texture (le cas de Camera2), `cropAndScale` n'ajuste qu'une matrice de
 * transformation : aucune copie de pixels. À 1×, l'image passe telle quelle.
 *
 * Le facteur glisse vers sa cible à la cadence de [CameraZoomPolicy.ramp], calculée à l'horloge des
 * images : aucune coroutine, aucun minuteur.
 */
class ZoomCropObserver(private val delegate: CapturerObserver) : CapturerObserver {
    @Volatile private var target: Float = 1f
    @Volatile private var rampRate: Float? = null
    private var current: Float = 1f
    private var lastNanos: Long = 0L

    fun setCrop(zoom: Float, rampRate: Float?) {
        this.target = zoom.coerceAtLeast(1f)
        this.rampRate = rampRate
    }

    override fun onCapturerStarted(success: Boolean) = delegate.onCapturerStarted(success)

    override fun onCapturerStopped() = delegate.onCapturerStopped()

    override fun onFrameCaptured(frame: VideoFrame) {
        advance(frame.timestampNs)
        if (current <= 1f + EPSILON) return delegate.onFrameCaptured(frame)
        val buffer = frame.buffer
        val rect = CameraZoomCrop.rect(buffer.width, buffer.height, current)
        val cropped = buffer.cropAndScale(rect.x, rect.y, rect.width, rect.height, buffer.width, buffer.height)
        val zoomed = VideoFrame(cropped, frame.rotation, frame.timestampNs)
        delegate.onFrameCaptured(zoomed)
        zoomed.release()
    }

    private fun advance(nowNanos: Long) {
        val seconds = if (lastNanos == 0L) 0f else ((nowNanos - lastNanos).coerceAtLeast(0L) / NANOS_PER_SECOND).toFloat()
        lastNanos = nowNanos
        val rate = rampRate
        current = if (rate == null) target else CameraZoomPolicy.ramp(current, target, rate, seconds)
    }

    private companion object {
        const val EPSILON = 0.001f
        const val NANOS_PER_SECOND = 1_000_000_000.0
    }
}
