package me.meeshy.sdk.call.montage

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import kotlin.math.max
import kotlin.math.min
import me.meeshy.sdk.call.montage.CallMontageInk.drawImage
import me.meeshy.sdk.call.montage.CallMontageInk.drawTextCentered
import me.meeshy.sdk.call.montage.CallMontageInk.fill
import me.meeshy.sdk.call.montage.CallMontageInk.gray
import me.meeshy.sdk.call.montage.CallMontageInk.linearGradient
import me.meeshy.sdk.call.montage.CallMontageInk.rgb
import me.meeshy.sdk.call.montage.CallMontageInk.stroke
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.montage.CallMontageCanvas
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.call.montage.CallMontageDecor
import me.meeshy.sdk.model.call.montage.CallMontageLayout
import me.meeshy.sdk.model.call.montage.CallMontageShape
import me.meeshy.sdk.model.call.montage.CallMontageSlot
import me.meeshy.sdk.model.call.montage.CallMontageStyle

/** Une personne d'un montage : son identifiant, son nom, son image (`null` ⇒ dégradé et initiale). */
class CallMontagePhoto(val id: String, val name: String, val image: Bitmap?)

/** Une case et la personne qu'elle porte. */
internal typealias CallMontagePlaced = List<Pair<CallMontageSlot, CallMontagePhoto>>

/**
 * **LE PEINTRE DES TREIZE CLASSIQUES DU MONTAGE** — miroir de `CallMontageRenderer.swift` (iOS) sur un
 * canevas Android : la géométrie vient de `CallMontageLayout` (`:core:model`), les décors de
 * `CallMontageDecor`, et chaque style peint son fond, ses cases et ses titres dans l'ordre d'iOS. Une
 * photo seule en Écran ou en Mosaïque devient un écran d'appareil ou une vraie mosaïque (#12589).
 */
object CallMontagePainter {

    /** Le montage complet à la taille donnée ; `null` si la taille est nulle ou la toile impossible. */
    fun render(style: CallMontageStyle, photos: List<CallMontagePhoto>, width: Int, height: Int, caption: CallMontageCaption): Bitmap? {
        if (width < 1 || height < 1) return null
        val bitmap = runCatching { Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888) }.getOrNull() ?: return null
        paint(Canvas(bitmap), style, photos, CallMontageCanvas(width.toDouble(), height.toDouble()), caption)
        return bitmap
    }

    fun paint(canvas: Canvas, style: CallMontageStyle, photos: List<CallMontagePhoto>, size: CallMontageCanvas, caption: CallMontageCaption) {
        val bounds = size.bounds
        val placed = CallMontageLayout.frames(style, photos.size, size).zip(photos)
        val unit = size.width / 1080
        val solo = photos.size == 1
        when (style) {
            CallMontageStyle.SCREEN -> if (solo) CallMontageSoloPainter.screen(canvas, bounds, placed, caption) else screen(canvas, bounds, placed, unit)
            CallMontageStyle.GRID -> if (solo) CallMontageSoloPainter.mosaic(canvas, bounds, placed) else grid(canvas, bounds, placed)
            CallMontageStyle.STRIP -> strip(canvas, bounds, placed, caption, unit)
            CallMontageStyle.POLAROID -> polaroids(canvas, bounds, placed, unit)
            CallMontageStyle.MAGAZINE -> magazine(canvas, bounds, placed, caption, unit)
            CallMontageStyle.COMIC -> comic(canvas, bounds, placed, unit)
            CallMontageStyle.HEART -> hearts(canvas, bounds, placed, caption, unit)
            CallMontageStyle.COVER -> CallMontageGlamourPainter.cover(canvas, bounds, placed, caption, unit)
            CallMontageStyle.GOLD -> CallMontageGlamourPainter.gold(canvas, bounds, placed, caption, unit)
            CallMontageStyle.REDCARPET -> CallMontageGlamourPainter.redCarpet(canvas, bounds, placed, caption, unit)
            CallMontageStyle.FILM -> CallMontageGlamourPainter.film(canvas, bounds, placed, unit)
            CallMontageStyle.NEON -> CallMontageGlamourPainter.neon(canvas, bounds, placed, caption, unit)
            CallMontageStyle.NOIR -> CallMontageGlamourPainter.noir(canvas, bounds, placed, caption, unit)
        }
    }

    // region Portraits

    /** La personne dans sa case : l'image découpée à la forme, ou un dégradé à son initiale. */
    internal fun drawPortrait(canvas: Canvas, photo: CallMontagePhoto, slot: CallMontageSlot, monochrome: Boolean = false) {
        canvas.save()
        if (slot.rotation != 0.0 && slot.shape != CallMontageShape.RECTANGLE) {
            canvas.rotate(slot.rotation.toFloat(), slot.frame.midX.toFloat(), slot.frame.midY.toFloat())
        }
        canvas.clipPath(CallMontageInk.path(slot))
        val image = photo.image?.takeIf { !it.isRecycled && it.width > 0 && it.height > 0 }
        if (image != null) drawImage(canvas, image, slot.frame, if (monochrome) monochromePaint() else null)
        else drawPlaceholder(canvas, photo, slot.frame)
        canvas.restore()
    }

    private fun monochromePaint() = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG).apply {
        colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(0f) })
    }

    private fun drawPlaceholder(canvas: Canvas, photo: CallMontagePhoto, rect: CallFrameRect) {
        val hue = CallMontageDecor.placeholderHue(photo.id)
        linearGradient(canvas, rect, CallMontageInk.hsb(hue, 0.55, 0.85), CallMontageInk.hsb(hue, 0.7, 0.55))
        val initial = photo.name.firstOrNull()?.uppercase() ?: "?"
        val size = min(rect.width, rect.height) * 0.4
        drawTextCentered(canvas, initial, CallMontageFont.BOLD, size, gray(1.0), rect.midX, rect.midY + size * 0.35, rect.width * 0.9)
    }

    // endregion

    // region Styles

    private fun screen(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, unit: Double) {
        fill(canvas, bounds, gray(0.0))
        placed.forEachIndexed { index, (slot, photo) ->
            drawPortrait(canvas, photo, slot)
            if (index > 0 && placed.size == 2) stroke(canvas, slot, gray(1.0, 0.9), 5 * unit)
        }
    }

    private fun grid(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced) {
        fill(canvas, bounds, rgb(0.06, 0.06, 0.1))
        placed.forEach { (slot, photo) -> drawPortrait(canvas, photo, slot) }
    }

    private fun strip(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, caption: CallMontageCaption, unit: Double) {
        fill(canvas, bounds, rgb(0.98, 0.97, 0.94))
        placed.forEach { (slot, photo) ->
            drawPortrait(canvas, photo, slot)
            stroke(canvas, slot, rgb(0.15, 0.15, 0.18), 3 * unit)
        }
        val band = CallMontageLayout.captionBand(CallMontageStyle.STRIP, CallMontageCanvas(bounds.width, bounds.height)) ?: return
        drawTextCentered(canvas, caption.title, CallMontageFont.HEAVY, 64 * unit, rgb(0.12, 0.12, 0.2), band.midX, band.minY + band.height * 0.45, band.width * 0.8)
        drawTextCentered(canvas, caption.subtitle, CallMontageFont.DEMI, 34 * unit, rgb(0.45, 0.45, 0.5), band.midX, band.minY + band.height * 0.72, band.width * 0.8)
    }

    private fun polaroids(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, unit: Double) {
        linearGradient(canvas, bounds, rgb(0.42, 0.3, 0.24), rgb(0.2, 0.13, 0.1))
        placed.forEach { (slot, photo) ->
            val card = CallMontageLayout.polaroidCard(slot.frame)
            canvas.save()
            canvas.rotate(slot.rotation.toFloat(), card.midX.toFloat(), card.midY.toFloat())
            val cardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = rgb(0.99, 0.99, 0.97)
                setShadowLayer((12 * unit).toFloat(), 0f, (10 * unit).toFloat(), gray(0.0, 0.45))
            }
            canvas.drawRect(CallMontageInk.rectF(card), cardPaint)
            drawPortrait(canvas, photo, CallMontageSlot(slot.frame, CallMontageShape.RECTANGLE))
            val footer = CallFrameRect(card.minX, slot.frame.maxY, card.width, card.maxY - slot.frame.maxY)
            drawTextCentered(canvas, photo.name, CallMontageFont.HAND, footer.height * 0.36, rgb(0.2, 0.2, 0.28), footer.midX, footer.minY + footer.height * 0.62, footer.width * 0.86)
            canvas.restore()
        }
    }

    private fun magazine(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, caption: CallMontageCaption, unit: Double) {
        fill(canvas, bounds, rgb(0.1, 0.1, 0.12))
        val cover = placed.firstOrNull() ?: return
        drawPortrait(canvas, cover.second, cover.first)
        linearGradient(canvas, CallFrameRect(0.0, 0.0, bounds.width, bounds.height * 0.3), gray(0.0, 0.6), gray(0.0, 0.0))
        linearGradient(canvas, CallFrameRect(0.0, bounds.height * 0.55, bounds.width, bounds.height * 0.45), gray(0.0, 0.0), gray(0.0, 0.75))
        CallMontageLayout.captionBand(CallMontageStyle.MAGAZINE, CallMontageCanvas(bounds.width, bounds.height))?.let { band ->
            drawTextCentered(canvas, caption.title.uppercase(), CallMontageFont.DISPLAY, band.height * 0.62, gray(1.0), band.midX, band.minY + band.height * 0.7, band.width * 0.9)
            drawTextCentered(canvas, caption.subtitle.uppercase(), CallMontageFont.DEMI, 30 * unit, rgb(1.0, 0.84, 0.3), band.midX, band.maxY + 30 * unit, band.width * 0.8)
        }
        val insets = placed.drop(1)
        val headline = (insets.firstOrNull()?.first?.frame?.minY ?: (bounds.maxY - bounds.height * 0.06)) - 40 * unit
        CallMontageInk.drawTextLeft(canvas, cover.second.name, CallMontageFont.HEAVY, 92 * unit, gray(1.0), bounds.width * 0.06, headline, bounds.width * 0.88)
        insets.forEach { (slot, photo) ->
            drawPortrait(canvas, photo, slot)
            stroke(canvas, slot, gray(1.0), 6 * unit)
        }
    }

    private fun comic(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, unit: Double) {
        fill(canvas, bounds, rgb(1.0, 0.84, 0.12))
        val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = rgb(0.95, 0.55, 0.05) }
        val radius = (bounds.width / 26 * 0.18).toFloat()
        CallMontageDecor.comicDots(bounds).forEach { canvas.drawCircle(it.x.toFloat(), it.y.toFloat(), radius, dot) }
        placed.forEach { (slot, photo) ->
            fill(canvas, slot.frame, gray(1.0))
            drawPortrait(canvas, photo, slot)
            stroke(canvas, slot, gray(0.0), 10 * unit)
            speechBubble(canvas, photo.name, slot.frame, unit)
        }
    }

    private fun hearts(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, caption: CallMontageCaption, unit: Double) {
        linearGradient(canvas, bounds, rgb(1.0, 0.55, 0.68), rgb(0.93, 0.24, 0.45))
        CallMontageDecor.embers(18, 0.0, bounds, CallMontageDecor.HEART_SEED).forEach { sparkle ->
            val side = sparkle.radius * 5
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = gray(1.0, 0.25 + sparkle.opacity * 0.3) }
            canvas.drawPath(CallMontageInk.heartPath(CallFrameRect(sparkle.center.x - side / 2, sparkle.center.y - side / 2, side, side)), paint)
        }
        placed.forEach { (slot, photo) ->
            val back = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = gray(1.0)
                setShadowLayer((11 * unit).toFloat(), 0f, (8 * unit).toFloat(), rgb(0.5, 0.0, 0.15, 0.4))
            }
            canvas.drawPath(CallMontageInk.heartPath(slot.frame), back)
            drawPortrait(canvas, photo, slot)
            stroke(canvas, slot, gray(1.0), 8 * unit)
        }
        CallMontageLayout.captionBand(CallMontageStyle.HEART, CallMontageCanvas(bounds.width, bounds.height))?.let { band ->
            drawTextCentered(canvas, caption.subtitle, CallMontageFont.DEMI, band.height * 0.42, gray(1.0), band.midX, band.minY + band.height * 0.6, band.width * 0.8)
        }
    }

    private fun speechBubble(canvas: Canvas, text: String, panel: CallFrameRect, unit: Double) {
        if (text.isEmpty()) return
        val fontSize = max(10.0, min(panel.width, panel.height) * 0.075)
        val width = min(panel.width * 0.7, CallMontageInk.measure(text, CallMontageFont.HAND, fontSize) + fontSize * 1.4)
        val height = fontSize * 1.8
        val bubble = CallFrameRect(panel.minX + panel.width * 0.05, panel.minY + panel.height * 0.05, width, height)
        val tail = Path().apply {
            moveTo((bubble.minX + width * 0.25).toFloat(), (bubble.maxY - 1).toFloat())
            lineTo((bubble.minX + width * 0.18).toFloat(), (bubble.maxY + height * 0.45).toFloat())
            lineTo((bubble.minX + width * 0.42).toFloat(), (bubble.maxY - 1).toFloat())
            close()
        }
        val corner = (min(width, height) / 2).toFloat()
        val body = Path().apply { addRoundRect(RectF(CallMontageInk.rectF(bubble)), corner, corner, Path.Direction.CW) }
        val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = gray(1.0) }
        val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            color = gray(0.0)
            strokeWidth = max(1.0, 4 * unit).toFloat()
        }
        listOf(body, tail).forEach { canvas.drawPath(it, fillPaint) }
        listOf(body, tail).forEach { canvas.drawPath(it, strokePaint) }
        drawTextCentered(canvas, text, CallMontageFont.HAND, fontSize, gray(0.0), bubble.midX, bubble.midY + fontSize * 0.35, width - fontSize)
    }

    // endregion
}
