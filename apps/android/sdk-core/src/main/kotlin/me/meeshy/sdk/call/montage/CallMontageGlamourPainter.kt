package me.meeshy.sdk.call.montage

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import kotlin.math.hypot
import kotlin.math.max
import me.meeshy.sdk.call.montage.CallMontageInk.drawTextCentered
import me.meeshy.sdk.call.montage.CallMontageInk.drawTextLeft
import me.meeshy.sdk.call.montage.CallMontageInk.fill
import me.meeshy.sdk.call.montage.CallMontageInk.glow
import me.meeshy.sdk.call.montage.CallMontageInk.gray
import me.meeshy.sdk.call.montage.CallMontageInk.linearGradient
import me.meeshy.sdk.call.montage.CallMontageInk.rgb
import me.meeshy.sdk.call.montage.CallMontageInk.stroke
import me.meeshy.sdk.call.montage.CallMontagePainter.drawPortrait
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.montage.CallMontageCanvas
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.call.montage.CallMontageDecor
import me.meeshy.sdk.model.call.montage.CallMontageLayout
import me.meeshy.sdk.model.call.montage.CallMontageStyle

/** Le glamour (#8580) — miroir de `CallMontageRenderer+Glamour.swift` : Couverture, Or, Tapis rouge, Pellicule, Néon, Noir. */
internal object CallMontageGlamourPainter {

    private fun band(style: CallMontageStyle, bounds: CallFrameRect) =
        CallMontageLayout.captionBand(style, CallMontageCanvas(bounds.width, bounds.height))

    fun cover(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, caption: CallMontageCaption, unit: Double) {
        fill(canvas, bounds, rgb(0.96, 0.94, 0.9))
        val hero = placed.firstOrNull() ?: return
        drawPortrait(canvas, hero.second, hero.first)
        val frame = hero.first.frame
        linearGradient(canvas, CallFrameRect(frame.minX, frame.maxY - frame.height * 0.4, frame.width, frame.height * 0.4), gray(0.0, 0.0), gray(0.0, 0.6))
        band(CallMontageStyle.COVER, bounds)?.let { band ->
            drawTextCentered(canvas, caption.title.uppercase(), CallMontageFont.DISPLAY, band.height * 0.82, rgb(0.82, 0.08, 0.18), band.midX, band.minY + band.height * 0.84, band.width * 0.92)
            drawTextLeft(canvas, caption.subtitle.uppercase(), CallMontageFont.DEMI, 26 * unit, rgb(0.2, 0.2, 0.24), frame.minX, band.maxY + 18 * unit, frame.width * 0.6)
        }
        val left = frame.minX + frame.width * 0.05
        drawTextLeft(canvas, hero.second.name.uppercase(), CallMontageFont.HEAVY, 84 * unit, gray(1.0), left, frame.maxY - frame.height * 0.2, frame.width * 0.9)
        val others = placed.drop(1).map { it.second.name }.filter { it.isNotEmpty() }
        if (others.isNotEmpty()) {
            drawTextLeft(canvas, "& " + others.joinToString(" · "), CallMontageFont.DEMI, 40 * unit, rgb(1.0, 0.84, 0.3), left, frame.maxY - frame.height * 0.13, frame.width * 0.9)
        }
        val code = CallFrameRect(left, frame.maxY - frame.height * 0.1, frame.width * 0.2, frame.height * 0.07)
        fill(canvas, code, gray(1.0))
        CallMontageDecor.barcodeBars(code).forEach { fill(canvas, it, gray(0.0)) }
        placed.drop(1).forEach { (slot, photo) ->
            drawPortrait(canvas, photo, slot)
            stroke(canvas, slot, gray(1.0), 6 * unit)
        }
    }

    fun gold(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, caption: CallMontageCaption, unit: Double) {
        linearGradient(canvas, bounds, rgb(0.22, 0.13, 0.05), rgb(0.06, 0.03, 0.02))
        CallMontageDecor.embers(28, 0.0, bounds, CallMontageDecor.GOLD_SEED).forEach { ember ->
            glow(canvas, ember.center.x, ember.center.y, ember.radius * 9, rgb(1.0, 0.78, 0.35, 0.18 + ember.opacity * 0.25))
        }
        placed.forEach { (slot, photo) ->
            stroke(canvas, slot, rgb(0.83, 0.64, 0.28), 22 * unit, glow = 50 * unit)
            drawPortrait(canvas, photo, slot)
            stroke(canvas, slot, rgb(0.98, 0.86, 0.55), 5 * unit)
        }
        band(CallMontageStyle.GOLD, bounds)?.let { band ->
            drawTextCentered(canvas, caption.title, CallMontageFont.DISPLAY_ITALIC, band.height * 0.6, rgb(0.98, 0.84, 0.5), band.midX, band.minY + band.height * 0.62, band.width * 0.8)
        }
    }

    fun redCarpet(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, caption: CallMontageCaption, unit: Double) {
        linearGradient(canvas, bounds, rgb(0.42, 0.02, 0.07), rgb(0.16, 0.0, 0.03))
        val fold = bounds.width / 14
        generateSequence(0.0) { it + fold * 2 }.takeWhile { it < bounds.width }.forEach { x ->
            fill(canvas, CallFrameRect(x, 0.0, fold, bounds.height), gray(0.0, 0.14))
        }
        val carpet = Path().apply {
            moveTo((bounds.width * 0.3).toFloat(), (bounds.height * 0.7).toFloat())
            lineTo((bounds.width * 0.7).toFloat(), (bounds.height * 0.7).toFloat())
            lineTo(bounds.maxX.toFloat(), bounds.maxY.toFloat())
            lineTo(bounds.minX.toFloat(), bounds.maxY.toFloat())
            close()
        }
        canvas.drawPath(carpet, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = rgb(0.78, 0.05, 0.12) })
        CallMontageDecor.embers(12, 0.0, bounds, CallMontageDecor.FLASH_SEED).forEach { flash ->
            glow(canvas, flash.center.x, flash.center.y, bounds.width * 0.07, gray(1.0, 0.35 + flash.opacity * 0.4))
            sparkle(canvas, flash.center.x, flash.center.y, bounds.width * 0.035, unit)
        }
        placed.forEach { (slot, photo) ->
            val shadow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = gray(0.0)
                setShadowLayer((15 * unit).toFloat(), 0f, (12 * unit).toFloat(), gray(0.0, 0.6))
            }
            canvas.drawPath(CallMontageInk.path(slot), shadow)
            drawPortrait(canvas, photo, slot)
            stroke(canvas, slot, rgb(0.95, 0.8, 0.45), 4 * unit)
        }
        band(CallMontageStyle.REDCARPET, bounds)?.let { band ->
            drawTextCentered(canvas, caption.title.uppercase(), CallMontageFont.DISPLAY, band.height * 0.55, gray(1.0), band.midX, band.minY + band.height * 0.55, band.width * 0.86)
            drawTextCentered(canvas, caption.subtitle, CallMontageFont.DEMI, band.height * 0.2, rgb(0.98, 0.84, 0.5), band.midX, band.minY + band.height * 0.88, band.width * 0.8)
        }
    }

    private fun sparkle(canvas: Canvas, cx: Double, cy: Double, radius: Double, unit: Double) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = gray(1.0, 0.9)
            strokeWidth = max(1.0, 3 * unit).toFloat()
        }
        canvas.drawLine((cx - radius).toFloat(), cy.toFloat(), (cx + radius).toFloat(), cy.toFloat(), paint)
        canvas.drawLine(cx.toFloat(), (cy - radius).toFloat(), cx.toFloat(), (cy + radius).toFloat(), paint)
    }

    fun film(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, unit: Double) {
        fill(canvas, bounds, rgb(0.06, 0.05, 0.05))
        val holePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = rgb(0.93, 0.91, 0.86) }
        CallMontageLayout.filmStrips(placed.size, CallMontageCanvas(bounds.width, bounds.height)).forEach { strip ->
            fill(canvas, strip, rgb(0.16, 0.12, 0.08))
            CallMontageDecor.filmHoles(strip).forEach { hole ->
                val corner = (hole.height * 0.25).toFloat()
                canvas.drawRoundRect(CallMontageInk.rectF(hole), corner, corner, holePaint)
            }
        }
        placed.forEachIndexed { index, (slot, photo) ->
            drawPortrait(canvas, photo, slot)
            stroke(canvas, slot, gray(0.0), 4 * unit)
            drawTextLeft(canvas, "${index + 1}A", CallMontageFont.MONO, 26 * unit, rgb(1.0, 0.62, 0.2), slot.frame.minX, slot.frame.maxY + 24 * unit, slot.frame.width * 0.3)
        }
    }

    fun neon(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, caption: CallMontageCaption, unit: Double) {
        linearGradient(canvas, bounds, rgb(0.07, 0.03, 0.14), rgb(0.02, 0.01, 0.05))
        val tubes = listOf(rgb(1.0, 0.2, 0.7), rgb(0.1, 0.9, 1.0))
        placed.forEachIndexed { index, (slot, photo) ->
            val tube = tubes[index % tubes.size]
            stroke(canvas, slot, tube, 12 * unit, glow = 45 * unit)
            drawPortrait(canvas, photo, slot)
            stroke(canvas, slot, tube, 8 * unit)
            stroke(canvas, slot, gray(1.0, 0.9), 2.5 * unit)
        }
        band(CallMontageStyle.NEON, bounds)?.let { band ->
            drawTextCentered(canvas, caption.title.uppercase(), CallMontageFont.HEAVY, band.height * 0.62, rgb(1.0, 0.72, 0.9), band.midX, band.minY + band.height * 0.72, band.width * 0.8, glow = tubes[0], glowRadius = 40 * unit)
        }
    }

    fun noir(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, caption: CallMontageCaption, unit: Double) {
        fill(canvas, bounds, gray(0.06))
        placed.forEach { (slot, photo) ->
            drawPortrait(canvas, photo, slot, monochrome = true)
            stroke(canvas, slot, gray(1.0, 0.85), 3 * unit)
        }
        grain(canvas, bounds, unit)
        vignette(canvas, bounds)
        band(CallMontageStyle.NOIR, bounds)?.let { band ->
            drawTextCentered(canvas, caption.title.uppercase() + "  ·  " + caption.subtitle, CallMontageFont.DISPLAY_LIGHT, band.height * 0.36, gray(1.0, 0.9), band.midX, band.minY + band.height * 0.6, band.width * 0.86)
        }
    }

    private fun grain(canvas: Canvas, bounds: CallFrameRect, unit: Double) {
        val side = max(1.0, 2 * unit).toFloat()
        val light = Paint().apply { color = gray(1.0, 0.12) }
        val dark = Paint().apply { color = gray(0.0, 0.12) }
        (0 until CallMontageDecor.GRAIN_SPECKS).forEach { index ->
            val x = (CallMontageDecor.grainUnit(index, 0x9E37) * bounds.width).toFloat()
            val y = (CallMontageDecor.grainUnit(index, 0x7F4A) * bounds.height).toFloat()
            canvas.drawRect(x, y, x + side, y + side, if (CallMontageDecor.grainUnit(index, 0x3C6E) > 0.5) light else dark)
        }
    }

    private fun vignette(canvas: Canvas, bounds: CallFrameRect) {
        val radius = (hypot(bounds.width, bounds.height) / 2).toFloat()
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(
                bounds.midX.toFloat(), bounds.midY.toFloat(), radius,
                intArrayOf(gray(0.0, 0.0), gray(0.0, 0.0), gray(0.0, 0.7)), floatArrayOf(0f, 0.45f, 1f), Shader.TileMode.CLAMP,
            )
        }
        canvas.drawRect(CallMontageInk.rectF(bounds), paint)
    }
}
