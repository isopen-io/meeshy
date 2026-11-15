package me.meeshy.ui.story.canvas

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.annotation.ColorInt
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.ComposeView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * Le rendu HORS ÉCRAN de la scène complète en [Bitmap] 9:16 (iOS `StoryStaticSnapshot` : même pipeline que le canevas
 * vivant) : fond, objets, dessin, verre — le contenu est l'arbre [SceneCanvas] lui-même, hébergé dans une vue détachée de
 * l'écran puis dessinée dans un bitmap. Polices, tailles, couleurs et débords d'encre sont donc ceux de l'écran, et la
 * fondation sert la couverture comme l'export image par image, sans dépendre d'un écran visible.
 *
 * Les bitmaps déjà en mémoire (médias retouchés, stickers image) entrent par [SceneMediaEnvironment.bitmapOf] dans le
 * [content] de l'appelant. Un échec — hôte absent, scène qui ne devient pas prête, exception de dessin — rend le fond plat
 * ([flatBackground]) : il ne bloque jamais l'appelant.
 */
public object SceneBitmapRenderer {

    /** Le délai au-delà duquel une scène qui n'est pas prête se rend en repli plat. */
    public const val READY_TIMEOUT_MS: Long = 2_500L

    /** Le repli : un aplat 9:16 de la couleur de fond de la slide. */
    public fun flatBackground(width: Int, height: Int, @ColorInt color: Int): Bitmap =
        Bitmap.createBitmap(width.coerceAtLeast(1), height.coerceAtLeast(1), Bitmap.Config.ARGB_8888).also { it.eraseColor(color) }

    /**
     * Rend [content] à [width] x [height] pixels. [host] reçoit la vue le temps du rendu (la racine de l'activité) ; [ready]
     * se complète quand la scène a chargé ses images (`SceneCanvasEvents.onContentReady`).
     */
    public suspend fun render(
        host: ViewGroup,
        width: Int,
        height: Int,
        @ColorInt fallbackColor: Int,
        ready: CompletableDeferred<Unit>,
        content: @Composable () -> Unit,
    ): Bitmap = withContext(Dispatchers.Main.immediate) {
        val fallback = { flatBackground(width, height, fallbackColor) }
        val view = ComposeView(host.context).apply { setContent(content) }
        val frame = FrameLayout(host.context).apply {
            alpha = 0f
            isClickable = false
            addView(view, FrameLayout.LayoutParams(width, height))
        }
        try {
            host.addView(frame, ViewGroup.LayoutParams(width, height))
            if (withTimeoutOrNull(READY_TIMEOUT_MS) { ready.await() } == null) return@withContext fallback()
            awaitFrame()
            view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
            view.layout(0, 0, width, height)
            Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { view.draw(Canvas(it)) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Throwable) {
            fallback()
        } finally {
            host.removeView(frame)
        }
    }

    private suspend fun awaitFrame() = suspendCancellableCoroutine<Unit> { continuation ->
        val callback = Choreographer.FrameCallback { continuation.resume(Unit) }
        Choreographer.getInstance().postFrameCallback(callback)
        continuation.invokeOnCancellation { Choreographer.getInstance().removeFrameCallback(callback) }
    }
}
