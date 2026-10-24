package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import kotlin.math.max
import me.meeshy.sdk.model.StoryTextObject
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import me.meeshy.ui.theme.hexColor

/**
 * **LES TEXTES DE LA RETOUCHE, PEINTS** (#12651) — miroir de `StoryStaticSnapshot.foreground` (iOS) : chaque
 * texte se pose à sa place normalisée, à sa taille rapportée au repère de 1 080 px de large, tourné et mis à
 * l'échelle, dans son style. L'écran et ce qui part passent par [paint] à leur définition : le texte cuit
 * est celui qu'on voyait, net à toute taille.
 */
public object RetouchTextPainter {
    private const val DESIGN_WIDTH = 1080f
    private const val WRAP_SHARE = 0.86f

    /** Les textes sur une toile transparente de [width] × [height] ; `null` sans texte écrit ou toile vide. */
    public fun overlay(texts: List<StoryTextObject>, width: Int, height: Int): Bitmap? {
        val written = texts.filter { it.text.isNotBlank() }
        if (written.isEmpty() || width < 1 || height < 1) return null
        val bitmap = runCatching { Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888) }.getOrNull() ?: return null
        paint(Canvas(bitmap), written, width.toFloat(), height.toFloat())
        return bitmap
    }

    /** Pose [overlay] sur [base], étirée à sa taille ; [base] elle-même sans calque. */
    public fun composited(base: Bitmap, texts: List<StoryTextObject>): Bitmap {
        val layer = overlay(texts, base.width, base.height) ?: return base
        val out = base.copy(Bitmap.Config.ARGB_8888, true) ?: return base
        Canvas(out).drawBitmap(layer, 0f, 0f, null)
        return out
    }

    public fun paint(canvas: Canvas, texts: List<StoryTextObject>, width: Float, height: Float) {
        texts.sortedBy { it.zIndex }.filter { it.text.isNotBlank() }.forEach { paintOne(canvas, it, width, height) }
    }

    /** Le rectangle (sans la rotation) qu'un texte couvre sur une toile de [width] × [height] — la cible de son toucher. */
    public fun bounds(text: StoryTextObject, width: Float, height: Float): android.graphics.RectF {
        val layout = layout(text, width)
        val inkWidth = (0 until layout.lineCount).maxOfOrNull { layout.getLineWidth(it) } ?: 0f
        val halfWidth = max(inkWidth, layout.paint.textSize) * text.scale.toFloat() / 2f
        val halfHeight = layout.height * text.scale.toFloat() / 2f
        val cx = (text.x * width).toFloat()
        val cy = (text.y * height).toFloat()
        return android.graphics.RectF(cx - halfWidth, cy - halfHeight, cx + halfWidth, cy + halfHeight)
    }

    private fun layout(text: StoryTextObject, width: Float): StaticLayout {
        val content = text.text.ifEmpty { " " }
        return StaticLayout.Builder.obtain(content, 0, content.length, textPaint(text, width), max(1, (width * WRAP_SHARE).toInt()))
            .setAlignment(alignment(text.textAlign))
            .build()
    }

    private fun paintOne(canvas: Canvas, text: StoryTextObject, width: Float, height: Float) {
        val layout = layout(text, width)
        val lines = (0 until layout.lineCount)
        val inkWidth = lines.maxOfOrNull { layout.getLineWidth(it) } ?: 0f
        canvas.save()
        canvas.translate((text.x * width).toFloat(), (text.y * height).toFloat())
        canvas.rotate(text.rotation.toFloat())
        canvas.scale(text.scale.toFloat(), text.scale.toFloat())
        canvas.translate(-layout.width / 2f + (layout.width - inkWidth) / 2f * alignShift(text.textAlign), -layout.height / 2f)
        layout.draw(canvas)
        canvas.restore()
    }

    private fun textPaint(text: StoryTextObject, width: Float): TextPaint {
        val unit = width / DESIGN_WIDTH
        return TextPaint(TextPaint.ANTI_ALIAS_FLAG).apply {
            textSize = max(1f, (text.fontSize * unit).toFloat())
            color = hexColor(text.textColor ?: "#FFFFFF", Color.White).toArgb()
            typeface = typeface(text.textStyle)
            if (text.textStyle == "neon") setShadowLayer(textSize * 0.35f, 0f, 0f, color)
            else setShadowLayer(textSize * 0.06f, 0f, textSize * 0.03f, 0x55000000)
        }
    }

    /** Un bloc aligné à gauche ou à droite garde son centre sur le point du texte : on recentre l'encre. */
    private fun alignShift(align: String?): Float = when (align) {
        "left" -> 1f
        "right" -> -1f
        else -> 0f
    }

    private fun alignment(align: String?): Layout.Alignment = when (align) {
        "left" -> Layout.Alignment.ALIGN_NORMAL
        "right" -> Layout.Alignment.ALIGN_OPPOSITE
        else -> Layout.Alignment.ALIGN_CENTER
    }

    private fun typeface(style: String?): Typeface = when (style) {
        "bold" -> Typeface.create("sans-serif-black", Typeface.BOLD)
        "neon" -> Typeface.create("sans-serif-condensed", Typeface.BOLD)
        "typewriter" -> Typeface.MONOSPACE
        "handwriting" -> Typeface.create("casual", Typeface.NORMAL)
        else -> Typeface.create("sans-serif-medium", Typeface.NORMAL)
    }
}
