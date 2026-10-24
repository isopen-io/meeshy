package me.meeshy.sdk.call.montage

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.montage.CallMontageShape
import me.meeshy.sdk.model.call.montage.CallMontageSlot

/** Les familles de lettres des classiques — les polices d'iOS (Didot, Avenir Next, Courier, Chalkboard) transposées. */
internal enum class CallMontageFont(val typeface: Typeface) {
    DISPLAY(Typeface.create(Typeface.SERIF, Typeface.BOLD)),
    DISPLAY_ITALIC(Typeface.create(Typeface.SERIF, Typeface.BOLD_ITALIC)),
    DISPLAY_LIGHT(Typeface.SERIF),
    HEAVY(Typeface.create("sans-serif-black", Typeface.BOLD)),
    DEMI(Typeface.create("sans-serif-medium", Typeface.NORMAL)),
    BOLD(Typeface.DEFAULT_BOLD),
    MONO(Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)),
    HAND(Typeface.create("casual", Typeface.BOLD)),
}

/** Les primitives de dessin du Montage — miroir de la section « Drawing primitives » de `CallMontageRenderer.swift`. */
internal object CallMontageInk {

    fun rgb(red: Double, green: Double, blue: Double, alpha: Double = 1.0): Int = Color.argb(
        channel(alpha), channel(red), channel(green), channel(blue),
    )

    fun gray(white: Double, alpha: Double = 1.0): Int = rgb(white, white, white, alpha)

    private fun channel(value: Double) = (value.coerceIn(0.0, 1.0) * 255).toInt()

    fun rectF(rect: CallFrameRect): RectF =
        android.graphics.RectF(rect.minX.toFloat(), rect.minY.toFloat(), rect.maxX.toFloat(), rect.maxY.toFloat())

    fun fill(canvas: Canvas, rect: CallFrameRect, color: Int) {
        canvas.drawRect(rectF(rect), Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color })
    }

    fun linearGradient(canvas: Canvas, rect: CallFrameRect, top: Int, bottom: Int) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(0f, rect.minY.toFloat(), 0f, rect.maxY.toFloat(), top, bottom, Shader.TileMode.CLAMP)
        }
        canvas.drawRect(rectF(rect), paint)
    }

    fun glow(canvas: Canvas, cx: Double, cy: Double, radius: Double, color: Int) {
        if (radius <= 0) return
        val clear = color and 0x00FFFFFF
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(cx.toFloat(), cy.toFloat(), radius.toFloat(), color, clear, Shader.TileMode.CLAMP)
        }
        canvas.drawCircle(cx.toFloat(), cy.toFloat(), radius.toFloat(), paint)
    }

    fun heartPath(rect: CallFrameRect): Path {
        val w = rect.width
        val h = rect.height
        return Path().apply {
            moveTo(rect.midX, rect.maxY)
            cubicTo(rect.midX - w * 0.1, rect.maxY - h * 0.12, rect.minX, rect.minY + h * 0.58, rect.minX, rect.minY + h * 0.3)
            cubicTo(rect.minX, rect.minY + h * 0.02, rect.midX - w * 0.04, rect.minY - h * 0.02, rect.midX, rect.minY + h * 0.2)
            cubicTo(rect.midX + w * 0.04, rect.minY - h * 0.02, rect.maxX, rect.minY + h * 0.02, rect.maxX, rect.minY + h * 0.3)
            cubicTo(rect.maxX, rect.minY + h * 0.58, rect.midX + w * 0.1, rect.maxY - h * 0.12, rect.midX, rect.maxY)
            close()
        }
    }

    fun path(slot: CallMontageSlot): Path = Path().apply {
        val rect = rectF(slot.frame)
        when (slot.shape) {
            CallMontageShape.RECTANGLE -> addRect(rect, Path.Direction.CW)
            CallMontageShape.ROUNDED_RECTANGLE -> {
                val radius = min(slot.cornerRadius, min(slot.frame.width, slot.frame.height) / 2).toFloat()
                addRoundRect(rect, radius, radius, Path.Direction.CW)
            }
            CallMontageShape.CIRCLE -> addOval(rect, Path.Direction.CW)
            CallMontageShape.HEART -> addPath(heartPath(slot.frame))
        }
    }

    fun stroke(canvas: Canvas, slot: CallMontageSlot, color: Int, width: Double, glow: Double = 0.0) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            this.color = color
            strokeWidth = max(1.0, width).toFloat()
            if (glow > 0) setShadowLayer((glow / 2).toFloat(), 0f, 0f, color)
        }
        canvas.drawPath(path(slot), paint)
    }

    /** L'image posée pour couvrir [rect], centrée, rognée à [rect]. */
    fun drawImage(canvas: Canvas, image: Bitmap, rect: CallFrameRect, paint: Paint? = null) {
        if (image.width <= 0 || image.height <= 0 || rect.width <= 0 || rect.height <= 0) return
        val scale = max(rect.width / image.width, rect.height / image.height)
        val drawnWidth = image.width * scale
        val drawnHeight = image.height * scale
        val target = android.graphics.RectF(
            (rect.midX - drawnWidth / 2).toFloat(), (rect.midY - drawnHeight / 2).toFloat(),
            (rect.midX + drawnWidth / 2).toFloat(), (rect.midY + drawnHeight / 2).toFloat(),
        )
        canvas.save()
        canvas.clipRect(rectF(rect))
        canvas.drawBitmap(image, null, target, paint ?: Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
        canvas.restore()
    }

    fun hsb(hue: Double, saturation: Double, brightness: Double): Int {
        val sector = hue * 6
        val chroma = brightness * saturation
        val secondary = chroma * (1 - abs(sector % 2 - 1))
        val offset = brightness - chroma
        val (r, g, b) = when (sector.toInt() % 6) {
            0 -> Triple(chroma, secondary, 0.0)
            1 -> Triple(secondary, chroma, 0.0)
            2 -> Triple(0.0, chroma, secondary)
            3 -> Triple(0.0, secondary, chroma)
            4 -> Triple(secondary, 0.0, chroma)
            else -> Triple(chroma, 0.0, secondary)
        }
        return rgb(r + offset, g + offset, b + offset)
    }

    private fun textPaint(font: CallMontageFont, size: Double, color: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = font.typeface
        textSize = max(size, 1.0).toFloat()
        this.color = color
    }

    fun measure(text: String, font: CallMontageFont, size: Double): Double =
        textPaint(font, size, Color.WHITE).measureText(text).toDouble()

    /** La taille qui fait tenir [text] dans [maxWidth] ; [size] si elle tient déjà. */
    fun fitted(text: String, font: CallMontageFont, size: Double, maxWidth: Double): Double {
        val width = measure(text, font, size)
        return if (width > maxWidth && width > 0) size * maxWidth / width else size
    }

    fun drawTextCentered(canvas: Canvas, text: String, font: CallMontageFont, size: Double, color: Int, centerX: Double, baseline: Double, maxWidth: Double, glow: Int? = null, glowRadius: Double = 0.0) {
        if (text.isEmpty()) return
        val fittedSize = fitted(text, font, size, maxWidth)
        val width = measure(text, font, fittedSize)
        drawLine(canvas, text, font, fittedSize, color, centerX - width / 2, baseline, glow, glowRadius)
    }

    fun drawTextLeft(canvas: Canvas, text: String, font: CallMontageFont, size: Double, color: Int, left: Double, baseline: Double, maxWidth: Double) {
        if (text.isEmpty()) return
        drawLine(canvas, text, font, fitted(text, font, size, maxWidth), color, left, baseline, null, 0.0)
    }

    private fun drawLine(canvas: Canvas, text: String, font: CallMontageFont, size: Double, color: Int, x: Double, baseline: Double, glow: Int?, glowRadius: Double) {
        val paint = textPaint(font, size, color)
        if (glow != null && glowRadius > 0) paint.setShadowLayer((glowRadius / 2).toFloat(), 0f, 0f, glow)
        canvas.drawText(text, x.toFloat(), baseline.toFloat(), paint)
    }

    private fun Path.moveTo(x: Double, y: Double) = moveTo(x.toFloat(), y.toFloat())

    private fun Path.cubicTo(x1: Double, y1: Double, x2: Double, y2: Double, x3: Double, y3: Double) =
        cubicTo(x1.toFloat(), y1.toFloat(), x2.toFloat(), y2.toFloat(), x3.toFloat(), y3.toFloat())
}
