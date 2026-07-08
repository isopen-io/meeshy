package me.meeshy.app.calls

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.webrtc.EglBase
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

/**
 * Renders one WebRTC [VideoTrack] into a [SurfaceViewRenderer]. The view's tag holds
 * the currently-attached track so a track swap (or null) detaches the old sink before
 * attaching the new — and [onRelease] always detaches and releases the GL surface.
 *
 * @param overlay put the surface on top (for the small self PiP over the remote feed).
 */
@Composable
fun VideoRenderer(
    track: VideoTrack?,
    eglContext: EglBase.Context,
    modifier: Modifier = Modifier,
    mirror: Boolean = false,
    overlay: Boolean = false,
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            SurfaceViewRenderer(context).apply {
                init(eglContext, null)
                setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                setEnableHardwareScaler(true)
                setMirror(mirror)
                if (overlay) setZOrderMediaOverlay(true)
            }
        },
        update = { renderer ->
            val attached = renderer.tag as? VideoTrack
            if (attached !== track) {
                attached?.removeSink(renderer)
                track?.addSink(renderer)
                renderer.tag = track
            }
        },
        onRelease = { renderer ->
            (renderer.tag as? VideoTrack)?.removeSink(renderer)
            renderer.tag = null
            renderer.release()
        },
    )
}
