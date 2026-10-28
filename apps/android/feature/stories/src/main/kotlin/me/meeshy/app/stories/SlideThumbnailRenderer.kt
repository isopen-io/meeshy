package me.meeshy.app.stories

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import me.meeshy.sdk.model.scene.StoryDrawingCanvasSpace
import me.meeshy.ui.theme.hexColor

/**
 * Paints a slide's tile: the fill, the background media centre-cropped, the strokes, the texts and the stickers, all in the
 * 1080-wide design referential scaled to the tile. Pure drawing on a small [Bitmap]; it never touches a view and is meant to
 * be called OFF the main thread (the rail renders on `Dispatchers.Default`). A blank scene is left black.
 */
internal object SlideThumbnailRenderer {

    fun render(spec: SlideThumbnailSpec, background: Bitmap?): Bitmap {
        val bitmap = Bitmap.createBitmap(spec.widthPx, spec.heightPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.Black.toArgb())
        if (spec.isBlank) return bitmap
        val width = spec.widthPx.toFloat()
        val height = spec.heightPx.toFloat()
        drawFill(canvas, spec, width, height)
        background?.let { drawCentreCrop(canvas, it, width, height) }
        drawStrokes(canvas, spec, width, height)
        drawTexts(canvas, spec, width, height)
        drawStickers(canvas, spec, width, height)
        return bitmap
    }

    private fun drawFill(canvas: Canvas, spec: SlideThumbnailSpec, width: Float, height: Float) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        when (val fill = spec.fill) {
            is StorySceneFill.Solid -> paint.color = argb(fill.hex)
            is StorySceneFill.Linear ->
                paint.shader = LinearGradient(0f, 0f, width, height, argb(fill.start), argb(fill.end), Shader.TileMode.CLAMP)
            is StorySceneFill.AuthorGradient ->
                paint.shader = LinearGradient(0f, 0f, 0f, height, argb(fill.accentHex), Color.Black.toArgb(), Shader.TileMode.CLAMP)
        }
        canvas.drawRect(0f, 0f, width, height, paint)
    }

    private fun drawCentreCrop(canvas: Canvas, image: Bitmap, width: Float, height: Float) {
        val scale = maxOf(width / image.width, height / image.height)
        val drawnW = image.width * scale
        val drawnH = image.height * scale
        val left = (width - drawnW) / 2f
        val top = (height - drawnH) / 2f
        canvas.drawBitmap(image, null, RectF(left, top, left + drawnW, top + drawnH), Paint(Paint.FILTER_BITMAP_FLAG))
    }

    private fun drawStrokes(canvas: Canvas, spec: SlideThumbnailSpec, width: Float, height: Float) {
        spec.strokes.forEach { stroke ->
            val first = stroke.points.firstOrNull() ?: return@forEach
            val path = Path().apply {
                moveTo(StoryDrawingCanvasSpace.toScreenX(first.x, width), StoryDrawingCanvasSpace.toScreenY(first.y, height))
                stroke.points.drop(1).forEach {
                    lineTo(StoryDrawingCanvasSpace.toScreenX(it.x, width), StoryDrawingCanvasSpace.toScreenY(it.y, height))
                }
            }
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
                color = argb(stroke.colorHex)
                strokeWidth = StoryDrawingCanvasSpace.toScreenWidth(stroke.width, width).coerceAtLeast(1f)
            }
            canvas.drawPath(path, paint)
        }
    }

    private fun drawTexts(canvas: Canvas, spec: SlideThumbnailSpec, width: Float, height: Float) {
        spec.texts.forEach { text ->
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = argb(text.colorHex)
                textAlign = Paint.Align.CENTER
                isFakeBoldText = true
                textSize = StoryTextMetrics.fontPx(text.fontDesignPx.toDouble(), 1.0, width)
            }
            canvas.save()
            canvas.rotate(text.rotationDeg, text.x * width, text.y * height)
            canvas.drawText(text.text.lineSequence().first(), text.x * width, text.y * height - (paint.ascent() + paint.descent()) / 2f, paint)
            canvas.restore()
        }
    }

    private fun drawStickers(canvas: Canvas, spec: SlideThumbnailSpec, width: Float, height: Float) {
        spec.stickers.forEach { sticker ->
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                textAlign = Paint.Align.CENTER
                textSize = StoryTextMetrics.fontPx(sticker.sizeDesignPx.toDouble(), 1.0, width)
            }
            canvas.save()
            canvas.rotate(sticker.rotationDeg, sticker.x * width, sticker.y * height)
            canvas.drawText(sticker.emoji, sticker.x * width, sticker.y * height - (paint.ascent() + paint.descent()) / 2f, paint)
            canvas.restore()
        }
    }

    private fun argb(hex: String): Int = hexColor(hex, Color.Black).toArgb()
}
