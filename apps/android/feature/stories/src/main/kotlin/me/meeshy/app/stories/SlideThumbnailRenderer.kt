package me.meeshy.app.stories

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrixColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import me.meeshy.sdk.model.scene.ForegroundMediaFrame
import me.meeshy.sdk.model.scene.StoryDrawingCanvasSpace
import me.meeshy.ui.theme.hexColor

/**
 * Paints a slide's tile as the composer canvas paints the scene (#13867): the fill (the scene's default gradient when
 * nothing is posed, never black), the background media (filtered, cropped or contained over its backdrop, zoomed and
 * panned), then the scene's objects in the ONE order of its stack — texts in their font, posed media, stickers — and the
 * drawing on top, all in the 1080-wide design referential scaled to the tile. Pure drawing on a small [Bitmap]; it never
 * touches a view and is meant to be called OFF the main thread (the rail renders on `Dispatchers.Default`).
 */
internal object SlideThumbnailRenderer {

    /** What the tile paints, bottom to top. */
    fun passes(spec: SlideThumbnailSpec): List<SlideThumbnailPass> = buildList {
        add(SlideThumbnailPass.Fill)
        if (spec.backgroundKey != null) add(SlideThumbnailPass.Background)
        spec.layers.forEach { add(SlideThumbnailPass.Layer(it)) }
        if (spec.strokes.isNotEmpty()) add(SlideThumbnailPass.Strokes)
    }

    fun render(spec: SlideThumbnailSpec, background: Bitmap?, placed: Map<String, Bitmap> = emptyMap()): Bitmap {
        val bitmap = Bitmap.createBitmap(spec.widthPx, spec.heightPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.Black.toArgb())
        val width = spec.widthPx.toFloat()
        val height = spec.heightPx.toFloat()
        passes(spec).forEach { pass ->
            when (pass) {
                SlideThumbnailPass.Fill -> drawFill(canvas, spec, width, height)
                SlideThumbnailPass.Background -> background?.let { drawBackground(canvas, spec, it, width, height) }
                SlideThumbnailPass.Strokes -> drawStrokes(canvas, spec, width, height)
                is SlideThumbnailPass.Layer -> when (val layer = pass.layer) {
                    is SlideThumbnailSpec.Text -> drawText(canvas, layer, width, height)
                    is SlideThumbnailSpec.Sticker -> drawSticker(canvas, layer, width, height)
                    is SlideThumbnailSpec.Media -> placed[layer.key]?.let { drawMedia(canvas, layer, it, width, height) }
                }
            }
        }
        return bitmap
    }

    /** A posed media at its place, the size the canvas gives it (iOS `ForegroundMediaFrame`), cropped to its frame and turned about its centre. */
    private fun drawMedia(canvas: Canvas, media: SlideThumbnailSpec.Media, image: Bitmap, width: Float, height: Float) {
        val size = ForegroundMediaFrame.renderedSize(media.aspectRatio, media.scale.toDouble(), width.toDouble())
        val centreX = media.x * width
        val centreY = media.y * height
        val frame = RectF(
            centreX - size.width.toFloat() / 2f, centreY - size.height.toFloat() / 2f,
            centreX + size.width.toFloat() / 2f, centreY + size.height.toFloat() / 2f,
        )
        val source = SlideThumbnailGeometry.imageRect(image.width, image.height, frame.width(), frame.height(), filled = true, framing = ThumbFraming.IDENTITY)
        canvas.save()
        canvas.rotate(media.rotationDeg, centreX, centreY)
        canvas.clipRect(frame)
        canvas.drawBitmap(
            image, null,
            RectF(frame.left + source.left, frame.top + source.top, frame.left + source.right, frame.top + source.bottom),
            Paint(Paint.FILTER_BITMAP_FLAG),
        )
        canvas.restore()
    }

    private fun drawFill(canvas: Canvas, spec: SlideThumbnailSpec, width: Float, height: Float) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        when (val fill = spec.fill) {
            StorySceneFill.Black -> paint.color = Color.Black.toArgb()
            is StorySceneFill.Solid -> paint.color = argb(fill.hex)
            is StorySceneFill.Linear ->
                paint.shader = LinearGradient(0f, 0f, width, height, argb(fill.start), argb(fill.end), Shader.TileMode.CLAMP)
            is StorySceneFill.AuthorGradient ->
                paint.shader = LinearGradient(0f, 0f, width, height, argb(fill.accentHex), Color.Black.toArgb(), Shader.TileMode.CLAMP)
        }
        canvas.drawRect(0f, 0f, width, height, paint)
    }

    /** The background as the composer canvas lays it: backdrop bands when contained, the filter on the media only, then crop/contain, zoom and pan. */
    private fun drawBackground(canvas: Canvas, spec: SlideThumbnailSpec, image: Bitmap, width: Float, height: Float) {
        if (!spec.filled) drawBackdrop(canvas, spec, image, width, height)
        val rect = SlideThumbnailGeometry.imageRect(image.width, image.height, width, height, spec.filled, spec.framing)
        val paint = Paint(Paint.FILTER_BITMAP_FLAG).apply {
            spec.look?.let { colorFilter = ColorMatrixColorFilter(it.values.toFloatArray()) }
        }
        canvas.drawBitmap(image, null, RectF(rect.left, rect.top, rect.right, rect.bottom), paint)
    }

    /** A solid tint, or the media itself blurred: a tile this small blurs by drawing a few pixels of the media up, smoothed. */
    private fun drawBackdrop(canvas: Canvas, spec: SlideThumbnailSpec, image: Bitmap, width: Float, height: Float) {
        spec.backdrop.solidHex?.let { hex ->
            canvas.drawRect(0f, 0f, width, height, Paint().apply { color = argb(hex) })
            return
        }
        val tiny = Bitmap.createScaledBitmap(image, BLUR_SAMPLES, (BLUR_SAMPLES * image.height / image.width.toFloat()).toInt().coerceAtLeast(1), true)
        val rect = SlideThumbnailGeometry.imageRect(tiny.width, tiny.height, width, height, filled = true, framing = ThumbFraming.IDENTITY)
        canvas.drawBitmap(tiny, null, RectF(rect.left, rect.top, rect.right, rect.bottom), Paint(Paint.FILTER_BITMAP_FLAG))
        if (tiny !== image) tiny.recycle()
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

    /** Every line of a text, in its font, aligned inside its block and tilted about the block's centre — the canvas's own laws. */
    private fun drawText(canvas: Canvas, text: SlideThumbnailSpec.Text, width: Float, height: Float) {
        val face = SlideThumbnailGeometry.typefaceOf(text.style)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = argb(text.colorHex)
            textAlign = Paint.Align.LEFT
            typeface = Typeface.create(face.family.platformFamily(), face.platformStyle())
            letterSpacing = face.letterSpacingEm
            textSize = StoryTextMetrics.fontPx(text.fontDesignPx.toDouble(), 1.0, width)
        }
        val lines = text.text.split('\n')
        val centreX = text.x * width
        val centreY = text.y * height
        val lineHeight = paint.fontSpacing
        val lefts = SlideThumbnailGeometry.lineLefts(lines.map(paint::measureText), text.align, text.rtl, centreX)
        val firstBaseline = centreY - lineHeight * lines.size / 2f - paint.ascent()
        canvas.save()
        canvas.rotate(text.rotationDeg, centreX, centreY)
        lines.forEachIndexed { index, line -> canvas.drawText(line, lefts[index], firstBaseline + index * lineHeight, paint) }
        canvas.restore()
    }

    private fun StoryTextFontFamily.platformFamily(): Typeface = when (this) {
        StoryTextFontFamily.SANS -> Typeface.SANS_SERIF
        StoryTextFontFamily.SERIF -> Typeface.SERIF
        StoryTextFontFamily.MONOSPACE -> Typeface.MONOSPACE
        StoryTextFontFamily.CURSIVE -> Typeface.create("cursive", Typeface.NORMAL)
    }

    private fun ThumbTypeface.platformStyle(): Int = when {
        bold && italic -> Typeface.BOLD_ITALIC
        bold -> Typeface.BOLD
        italic -> Typeface.ITALIC
        else -> Typeface.NORMAL
    }

    private fun drawSticker(canvas: Canvas, sticker: SlideThumbnailSpec.Sticker, width: Float, height: Float) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textAlign = Paint.Align.CENTER
            textSize = StoryTextMetrics.fontPx(sticker.sizeDesignPx.toDouble(), 1.0, width)
        }
        canvas.save()
        canvas.rotate(sticker.rotationDeg, sticker.x * width, sticker.y * height)
        canvas.drawText(sticker.emoji, sticker.x * width, sticker.y * height - (paint.ascent() + paint.descent()) / 2f, paint)
        canvas.restore()
    }

    private const val BLUR_SAMPLES = 12

    private fun argb(hex: String): Int = hexColor(hex, Color.Black).toArgb()
}

/** One step of a tile's painting, bottom to top (#13867). */
internal sealed interface SlideThumbnailPass {
    data object Fill : SlideThumbnailPass
    data object Background : SlideThumbnailPass
    data class Layer(val layer: SlideThumbnailSpec.Layer) : SlideThumbnailPass
    data object Strokes : SlideThumbnailPass
}
