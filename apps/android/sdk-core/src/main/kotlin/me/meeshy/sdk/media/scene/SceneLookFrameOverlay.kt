package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.RectF
import androidx.media3.effect.BitmapOverlay
import kotlin.math.max
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat

/**
 * **LE CADRE D'UNE VIDÉO DE FOND RÉGLÉE, POSÉ AVEC LES OBJETS** (#14875) : le cadre d'un look couvre la vidéo à sa taille
 * rendue ; le cadrage au format (`Presentation`, remplissage centré) l'agrandit d'autant. Peint une fois au format comme le
 * moteur poserait la vidéo, il entre au plus bas de la pile des calques, sur la seule fenêtre [startMillis]–[endMillis] de
 * sa vidéo : la vidéo réglée ne coûte ainsi aucune passe GL de plus que la vidéo nue. Appelé sur le fil GL de Media3.
 * [filter] : le look de la diapo (#15224), que l'aperçu pose sur la vidéo ET sur son cadre — le cadre le reçoit en se peignant.
 */
internal class SceneLookFrameOverlay(
    private val frame: Bitmap,
    private val startMillis: Long,
    private val endMillis: Long,
    private val format: StoryExportVideoFormat,
    private val filter: ColorFilter? = null,
) : BitmapOverlay() {

    private var painted: Bitmap? = null

    override fun getBitmap(presentationTimeUs: Long): Bitmap {
        val atMillis = presentationTimeUs / MICROS_PER_MILLI
        if (atMillis < startMillis || atMillis >= endMillis) {
            if (atMillis >= endMillis) discard()
            return SceneTransparent.pixel
        }
        return painted ?: fitted().also { painted = it }
    }

    override fun release() {
        super.release()
        discard()
    }

    private fun fitted(): Bitmap {
        val width = format.width.toFloat()
        val height = format.height.toFloat()
        val scale = max(width / frame.width, height / frame.height)
        val halfWidth = frame.width * scale / 2f
        val halfHeight = frame.height * scale / 2f
        return Bitmap.createBitmap(format.width, format.height, Bitmap.Config.ARGB_8888).also { target ->
            val box = RectF(width / 2f - halfWidth, height / 2f - halfHeight, width / 2f + halfWidth, height / 2f + halfHeight)
            Canvas(target).drawBitmap(frame, null, box, filter?.let { Paint(PAINT).apply { colorFilter = it } } ?: PAINT)
        }
    }

    private fun discard() {
        painted?.recycle()
        painted = null
    }

    internal companion object {
        private const val MICROS_PER_MILLI = 1000L
        private val PAINT = Paint(Paint.FILTER_BITMAP_FLAG)

        /** Un cadre par fenêtre continue d'éléments qui portent le même look encadré, sur l'horloge de la séquence. */
        fun of(items: List<SceneVideoItem>, format: StoryExportVideoFormat): List<SceneLookFrameOverlay> {
            val spans = items.runningFold(0L) { start, item -> start + item.spanMillis }
            return items.indices
                .filter { index -> items[index].look?.look?.frame != null && items.getOrNull(index - 1)?.look !== items[index].look }
                .map { first ->
                    val look = checkNotNull(items[first].look)
                    val last = (first until items.size).takeWhile { items[it].look === look }.last()
                    SceneLookFrameOverlay(checkNotNull(look.look.frame), spans[first], spans[last + 1], format, look.sceneFilter)
                }
        }
    }
}
