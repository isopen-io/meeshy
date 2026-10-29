package me.meeshy.app.calls

import android.content.Context
import android.graphics.SurfaceTexture
import android.view.TextureView
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import java.util.concurrent.CountDownLatch
import org.webrtc.EglBase
import org.webrtc.EglRenderer
import org.webrtc.GlRectDrawer
import org.webrtc.ThreadUtils
import org.webrtc.VideoTrack

/** Une piste à poser dans une case du cadre, et si elle s'affiche en miroir (ma caméra avant). */
data class CallLiveFrameVideoSource(val track: VideoTrack, val isMirrored: Boolean)

/**
 * **LA VIDÉO D'UNE CASE DU CADRE** (#13687, miroir de iOS `CallLiveFrameVideoFeed`) : la piste rendue dans une
 * `TextureView` — et non une `SurfaceView`, qui perce la fenêtre et ignorerait la forme, la rotation et le ton de
 * la case. Le rendu remplit la case sans déformation (rognée, centrée) sur la carte graphique, sans copie par image.
 */
@Composable
internal fun CallLiveFrameVideo(source: CallLiveFrameVideoSource, eglContext: EglBase.Context, modifier: Modifier = Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { context -> CallLiveFrameTextureView(context, eglContext) },
        update = { view -> view.show(source) },
        onRelease = { view -> view.release() },
    )
}

/** Une `TextureView` qui reçoit les images d'une piste WebRTC par un [EglRenderer] à elle. */
internal class CallLiveFrameTextureView(context: Context, eglContext: EglBase.Context) : TextureView(context), TextureView.SurfaceTextureListener {
    private val renderer = EglRenderer("call-live-frame").apply { init(eglContext, EglBase.CONFIG_PLAIN, GlRectDrawer()) }
    private var attached: VideoTrack? = null

    init {
        isOpaque = false
        surfaceTextureListener = this
    }

    fun show(source: CallLiveFrameVideoSource) {
        renderer.setMirror(source.isMirrored)
        if (attached === source.track) return
        attached?.removeSink(renderer)
        source.track.addSink(renderer)
        attached = source.track
    }

    fun release() {
        attached?.removeSink(renderer)
        attached = null
        renderer.release()
    }

    override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
        renderer.setLayoutAspectRatio(aspect(width, height))
        renderer.createEglSurface(surface)
    }

    override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {
        renderer.setLayoutAspectRatio(aspect(width, height))
    }

    /** La surface part : le rendu la lâche AVANT, sinon il écrirait dans une texture détruite. */
    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        val released = CountDownLatch(1)
        renderer.releaseEglSurface(released::countDown)
        ThreadUtils.awaitUninterruptibly(released)
        return true
    }

    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) = Unit

    private fun aspect(width: Int, height: Int): Float = if (height > 0) width.toFloat() / height else 1f
}
