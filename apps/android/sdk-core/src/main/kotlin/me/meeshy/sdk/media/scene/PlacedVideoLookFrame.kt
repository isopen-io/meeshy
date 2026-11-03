package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import kotlin.math.roundToInt

/**
 * **L'IMAGE D'UNE VIDÉO POSÉE, SOUS SON LOOK** (#14875) : ce que les effets de la retouche font sur le GPU, peint sur
 * l'image décodée — le cadrage, le filtre, la pose dans la case du cadre (bornes du GPU, y vers le haut), puis le cadre
 * par-dessus. Le résultat a la taille du cadre (peint à la taille des images décodées), ou celle de l'image cadrée sans
 * cadre ; une seule surface sert toutes les images. Appelé sur le fil GL de Media3.
 */
internal class PlacedVideoLookFrame(private val look: SceneExportVideoLook) {

    private var surface: Bitmap? = null
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
        colorFilter = look.colorMatrix?.let(::ColorMatrixColorFilter)
    }

    fun looked(frame: Bitmap): Bitmap {
        val source = sourceRect(frame)
        val layer = look.look.frame
        val width = layer?.width ?: source.width()
        val height = layer?.height ?: source.height()
        val target = surface?.takeIf { it.width == width && it.height == height }
            ?: Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { surface?.recycle(); surface = it }
        target.eraseColor(TRANSPARENT)
        val canvas = Canvas(target)
        canvas.drawBitmap(frame, source, placed(width.toFloat(), height.toFloat()), paint)
        layer?.let { canvas.drawBitmap(it, null, RectF(0f, 0f, width.toFloat(), height.toFloat()), FRAME_PAINT) }
        return target
    }

    fun release() {
        surface?.recycle()
        surface = null
    }

    private fun sourceRect(frame: Bitmap): Rect {
        val crop = look.crop ?: return Rect(0, 0, frame.width, frame.height)
        val left = (crop.x * frame.width).roundToInt().coerceIn(0, frame.width - 1)
        val top = (crop.y * frame.height).roundToInt().coerceIn(0, frame.height - 1)
        val right = ((crop.x + crop.width) * frame.width).roundToInt().coerceIn(left + 1, frame.width)
        val bottom = ((crop.y + crop.height) * frame.height).roundToInt().coerceIn(top + 1, frame.height)
        return Rect(left, top, right, bottom)
    }

    private fun placed(width: Float, height: Float): RectF {
        val place = look.look.placement ?: return RectF(0f, 0f, width, height)
        val centerX = width / 2f * (1f + place.translateX)
        val centerY = height / 2f * (1f - place.translateY)
        val halfWidth = width * place.scale / 2f
        val halfHeight = height * place.scale / 2f
        return RectF(centerX - halfWidth, centerY - halfHeight, centerX + halfWidth, centerY + halfHeight)
    }

    private companion object {
        const val TRANSPARENT = 0
        val FRAME_PAINT = Paint(Paint.FILTER_BITMAP_FLAG)
    }
}
