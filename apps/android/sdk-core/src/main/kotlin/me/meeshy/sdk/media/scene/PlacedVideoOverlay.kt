package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import androidx.media3.effect.BitmapOverlay
import kotlin.math.max
import kotlin.math.roundToInt
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat

/** Les images d'une vidéo posée, lues à l'instant de sa source ; `null` : l'image ne se décode pas. */
internal interface PlacedVideoFrames {
    fun frameAt(sourceMillis: Long): Bitmap?
    fun release()
}

/**
 * **Une vidéo posée, VIVANTE dans son cadre** (#13897) : à chaque image rendue, l'image de sa source que son horloge
 * désigne (fenêtre coupée, boucle), peinte à sa pose de l'instant — centre, taille, rotation, arrondi, opacité — et sous son
 * look, sur un calque transparent de la taille du format. Sur le S8, une vidéo posée ne sortait dans AUCUNE image : la
 * composition ne la déclarait pas et le peintre des calques n'en tient que l'affiche.
 *
 * Hors de sa présence, elle ne pose qu'un pixel transparent et rend son décodeur ; le calque du format ne vit que tant
 * qu'elle est à l'écran. Appelé sur le fil GL de Media3.
 */
internal class PlacedVideoOverlay(
    private val video: SceneExportPlacedVideo,
    private val format: StoryExportVideoFormat,
    private val open: (SceneExportPlacedVideo) -> PlacedVideoFrames,
) : BitmapOverlay() {

    private var frames: PlacedVideoFrames? = null
    private var surface: Bitmap? = null
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
        colorFilter = video.colorMatrix?.let(::ColorMatrixColorFilter)
    }

    override fun getBitmap(presentationTimeUs: Long): Bitmap {
        val atMillis = presentationTimeUs / MICROS_PER_MILLI
        val source = video.clock.sourceAt(atMillis)
        val placement = source?.let { video.placementAt(atMillis) }?.takeIf { it.opacity > 0f && it.width > 0f && it.height > 0f }
        if (source == null || placement == null) {
            if (atMillis >= video.clock.endMillis) discard()
            return SceneTransparent.pixel
        }
        val frame = (frames ?: open(video).also { frames = it }).frameAt(source) ?: return SceneTransparent.pixel
        val target = surface ?: Bitmap.createBitmap(format.width, format.height, Bitmap.Config.ARGB_8888).also { surface = it }
        target.eraseColor(TRANSPARENT)
        paint(Canvas(target), frame, placement)
        return target
    }

    override fun release() {
        super.release()
        discard()
    }

    private fun paint(canvas: Canvas, frame: Bitmap, placement: SceneExportPlacement) {
        val halfWidth = placement.width / 2f
        val halfHeight = placement.height / 2f
        val box = RectF(-halfWidth, -halfHeight, halfWidth, halfHeight)
        val fill = max(placement.width / frame.width, placement.height / frame.height)
        val drawnHalfWidth = frame.width * fill / 2f
        val drawnHalfHeight = frame.height * fill / 2f
        paint.alpha = (placement.opacity.coerceIn(0f, 1f) * OPAQUE).roundToInt()
        canvas.save()
        canvas.translate(placement.centerX, placement.centerY)
        canvas.rotate(placement.rotationDegrees)
        canvas.clipPath(Path().apply { addRoundRect(box, placement.cornerRadius, placement.cornerRadius, Path.Direction.CW) })
        canvas.drawBitmap(frame, null, RectF(-drawnHalfWidth, -drawnHalfHeight, drawnHalfWidth, drawnHalfHeight), paint)
        canvas.restore()
    }

    private fun discard() {
        frames?.release()
        frames = null
        surface?.recycle()
        surface = null
    }

    private companion object {
        const val MICROS_PER_MILLI = 1000L
        const val OPAQUE = 255f
        const val TRANSPARENT = 0
    }
}
