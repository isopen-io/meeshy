package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.media3.common.VideoFrameProcessingException
import androidx.media3.effect.BitmapOverlay
import me.meeshy.sdk.model.scene.export.StoryExportOverlayFrame
import me.meeshy.sdk.model.scene.export.StoryExportOverlayTrack

/**
 * Le calque des objets À L'INSTANT de chaque image rendue : celui dont l'intervalle couvre l'heure de l'image. Un calque sur
 * disque n'est décodé qu'à son entrée et libéré à sa sortie — une story de 4 min ne tient en mémoire qu'un calque à la fois.
 * Appelé sur le fil GL de Media3.
 */
internal class TimedBitmapOverlay(private val overlays: List<SceneExportOverlay>) : BitmapOverlay() {

    private val track = StoryExportOverlayTrack(overlays.map { StoryExportOverlayFrame(it.startMillis, it.endMillis) })
    private var shownIndex = -1
    private var shown: Bitmap? = null

    override fun getBitmap(presentationTimeUs: Long): Bitmap {
        val index = track.indexAt(presentationTimeUs / MICROS_PER_MILLI).coerceAtLeast(0)
        val current = shown
        if (index == shownIndex && current != null) return current
        val next = load(overlays[index])
        discardShown()
        shownIndex = index
        shown = next
        return next
    }

    override fun release() {
        super.release()
        discardShown()
    }

    private fun load(overlay: SceneExportOverlay): Bitmap = when (overlay) {
        is SceneExportOverlay.Painted -> overlay.bitmap
        is SceneExportOverlay.Stored -> BitmapFactory.decodeFile(overlay.file.absolutePath)
            ?: throw VideoFrameProcessingException("calque illisible")
    }

    /** Seul un calque décodé ici se libère ici ; un calque peint appartient à l'appelant. */
    private fun discardShown() {
        val index = shownIndex
        val bitmap = shown
        if (bitmap != null && overlays.getOrNull(index) is SceneExportOverlay.Stored) bitmap.recycle()
        shown = null
        shownIndex = -1
    }

    private companion object {
        const val MICROS_PER_MILLI = 1000L
    }
}
