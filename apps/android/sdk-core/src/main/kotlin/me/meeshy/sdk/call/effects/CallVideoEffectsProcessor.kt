package me.meeshy.sdk.call.effects

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.PowerManager
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.effects.CallVideoDegradation
import me.meeshy.sdk.model.call.effects.CallVideoEffectsPlan
import org.webrtc.ThreadUtils
import org.webrtc.VideoFrame
import org.webrtc.VideoProcessor
import org.webrtc.VideoSink
import timber.log.Timber

/**
 * **LES EFFETS DE MA CAMÉRA, SUR L'IMAGE ENVOYÉE** (#13331) — iOS `VideoFilterPipeline` for Android. It
 * sits on the camera's `VideoSource` (`setVideoProcessor`): every frame goes through it BEFORE the
 * encoder, so the other side sees the effect and the local preview shows exactly what leaves. Nothing
 * changes in the signalling: same track, same resolution, same cadence — no renegotiation.
 *
 * - Nothing chosen ⇒ the frame is forwarded as is, at no cost.
 * - Each processed frame reports its time to [CallVideoDegradation]: an effect that cannot hold the
 *   camera's cadence is shed rung by rung (blur first, smoothing at half), the colour stays (#12686).
 * - Any GL failure turns the effects off for the rest of the call and forwards the camera.
 *
 * Frames arrive on the capture thread ([handler]), where the EGL context is current.
 */
internal class CallVideoEffectsProcessor(
    private val handler: Handler,
    private val segmenter: CallPersonSegmenter,
    private val isConstrained: () -> Boolean,
) : VideoProcessor {
    @Volatile private var sink: VideoSink? = null
    @Volatile private var config: VideoFilterConfig = VideoFilterConfig.DEFAULT
    private var ladder = CallVideoDegradation()
    private var renderer: CallEffectsGlRenderer? = null
    @Volatile private var hasRenderer = false
    private var broken = false
    private var blurWasOn = false
    private val masks = CallPersonMaskStore(segmenter)

    fun setConfig(next: VideoFilterConfig) {
        config = next
    }

    override fun setSink(sink: VideoSink?) {
        this.sink = sink
    }

    override fun onCapturerStarted(success: Boolean) = Unit

    override fun onCapturerStopped() = Unit

    override fun onFrameCaptured(frame: VideoFrame) {
        val out = sink ?: return
        val plan = if (broken) null else CallVideoEffectsPlan.make(config, ladder, isConstrained())
        val input = frame.buffer as? VideoFrame.TextureBuffer
        if (plan == null || input == null) {
            ladder = ladder.recording(0.0, blurActive = false)
            forgetMaskWhenBlurStops(blurOn = false)
            out.onFrame(frame)
            return
        }
        val start = System.nanoTime()
        val processed = try {
            process(frame, input, plan)
        } catch (failure: RuntimeException) {
            Timber.w(failure, "call video effects failed, the camera goes out untouched")
            broken = true
            null
        }
        if (processed == null) {
            out.onFrame(frame)
            return
        }
        out.onFrame(processed)
        processed.release()
        ladder = ladder.recording((System.nanoTime() - start) / NANOS_PER_MS, plan.blurActive)
    }

    private fun process(frame: VideoFrame, input: VideoFrame.TextureBuffer, plan: CallVideoEffectsPlan): VideoFrame? {
        val gl = renderer ?: CallEffectsGlRenderer(handler).also {
            renderer = it
            hasRenderer = true
        }
        val rung = plan.blur
        forgetMaskWhenBlurStops(blurOn = rung != null)
        if (rung != null) {
            masks.submitIfDue(input, frame.rotation, frame.timestampNs, rung)
            masks.takeFresh()?.let(gl::upload)
        }
        return gl.render(frame, input, plan, withMask = rung != null && masks.isReady)
    }

    /** A blur switched off drops its mask: switched back on, it never composites a stale silhouette. */
    private fun forgetMaskWhenBlurStops(blurOn: Boolean) {
        if (blurWasOn && !blurOn) masks.reset()
        blurWasOn = blurOn
    }

    /** Frees the GL resources on the capture thread, then the segmenter. Call before disposing the helper. */
    fun release() {
        sink = null
        if (hasRenderer) {
            runCatching {
                ThreadUtils.invokeAtFrontUninterruptibly(handler) {
                    renderer?.release()
                    renderer = null
                }
            }
        }
        masks.close()
    }

    private companion object {
        const val NANOS_PER_MS = 1_000_000.0
    }
}

/**
 * Does the device protect itself? Power saving, or severe heat (API 29+): the blur is capped at its slow
 * rung, as iOS `isDeviceConstrained`. Read at most once every two seconds — never per frame.
 */
internal class CallDeviceConstraint(context: Context) {
    private val power = context.getSystemService(PowerManager::class.java)
    private var readAtNanos = 0L
    private var constrained = false

    fun isConstrained(): Boolean {
        val now = System.nanoTime()
        if (readAtNanos != 0L && now - readAtNanos < REFRESH_NANOS) return constrained
        readAtNanos = now
        val pm = power ?: return false
        val hot = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm.currentThermalStatus >= PowerManager.THERMAL_STATUS_SEVERE
        constrained = pm.isPowerSaveMode || hot
        return constrained
    }

    private companion object {
        const val REFRESH_NANOS = 2_000_000_000L
    }
}
