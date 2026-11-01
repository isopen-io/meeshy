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
 *
 * Les calques de profondeur 0 couvrent toute la vidéo (le dernier tient au-delà). Ceux d'au-dessus d'une vidéo posée
 * ([gaps], #13897) n'existent que sur les slides qui en ont : hors de leurs intervalles, rien ne se pose.
 */
internal class TimedBitmapOverlay(private val overlays: List<SceneExportOverlay>, private val gaps: Boolean = false) : BitmapOverlay() {

    private val track = StoryExportOverlayTrack(overlays.map { StoryExportOverlayFrame(it.startMillis, it.endMillis) })
    private var shownIndex = -1
    private var shown: Bitmap? = null

    override fun getBitmap(presentationTimeUs: Long): Bitmap {
        val atMillis = presentationTimeUs / MICROS_PER_MILLI
        val index = track.indexAt(atMillis).coerceAtLeast(0)
        if (gaps && overlays.getOrNull(index)?.let { atMillis >= it.startMillis && atMillis < it.endMillis } != true) return SceneTransparent.pixel
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
