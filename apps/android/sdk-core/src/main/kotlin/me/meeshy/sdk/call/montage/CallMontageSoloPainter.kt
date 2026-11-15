package me.meeshy.sdk.call.montage

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import kotlin.math.min
import me.meeshy.sdk.call.montage.CallMontageInk.drawTextLeft
import me.meeshy.sdk.call.montage.CallMontageInk.fill
import me.meeshy.sdk.call.montage.CallMontageInk.gray
import me.meeshy.sdk.call.montage.CallMontageInk.linearGradient
import me.meeshy.sdk.call.montage.CallMontageInk.rgb
import me.meeshy.sdk.call.montage.CallMontagePainter.drawPortrait
import me.meeshy.sdk.model.brand.BrandMarkGeometry
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.frames.CallFrameText
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.call.montage.CallMontageSoloLayout
import me.meeshy.sdk.model.call.montage.CallMontageSoloMosaic

/**
 * **ÉCRAN ET MOSAÏQUE D'UNE PHOTO SEULE** (#12589) — miroir de `CallMontageRenderer+Solo.swift`. La photo se
 * peint d'abord, puis le décor qui la recouvre — reflet, voile, barre d'état, teintes, joints, signature.
 */
internal object CallMontageSoloPainter {
    private const val BRAND_SMALL = 0.03
    private const val BRAND_MEDIUM = 0.042
    private const val GLYPH_DASH_WIDTH = 88f
    private const val RIM_SHARE = 0.004

    fun screen(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced, caption: CallMontageCaption) {
        val solo = CallMontageSoloLayout.screen(bounds)
        val reach = min(bounds.width, bounds.height)
        fill(canvas, bounds, gray(0.0))
        rim(canvas, bounds)
        placed.forEach { (slot, photo) -> drawPortrait(canvas, photo, slot) }
        canvas.save()
        val radius = solo.cornerRadius.toFloat()
        canvas.clipPath(Path().apply { addRoundRect(CallMontageInk.rectF(solo.screen), radius, radius, Path.Direction.CW) })
        reflection(canvas, solo.reflection.map { it.x.toFloat() to it.y.toFloat() })
        linearGradient(
            canvas,
            CallFrameRect(solo.screen.minX, solo.screen.minY, solo.screen.width, solo.statusBand.height * 1.6),
            gray(0.0, 0.35), gray(0.0, 0.0),
        )
        canvas.restore()
        statusBar(canvas, solo.screen, solo.statusBand, solo.cornerRadius, caption, reach)
    }

    fun mosaic(canvas: Canvas, bounds: CallFrameRect, placed: CallMontagePlaced) {
        val mosaic = CallMontageSoloLayout.mosaic(bounds)
        fill(canvas, bounds, rgb(0.06, 0.06, 0.1))
        placed.forEach { (slot, photo) -> drawPortrait(canvas, photo, slot) }
        canvas.save()
        placed.firstOrNull()?.let { canvas.clipPath(CallMontageInk.path(it.first)) }
        tints(canvas, mosaic)
        joints(canvas, mosaic)
        canvas.restore()
        brand(canvas, unit = min(bounds.width, bounds.height), share = BRAND_MEDIUM, cx = mosaic.band.midX, cy = mosaic.band.midY, alignRight = null)
    }

    /** Le liseré du boîtier : le coin du boîtier se lit sur le noir du bord. */
    private fun rim(canvas: Canvas, bounds: CallFrameRect) {
        val width = bounds.width * RIM_SHARE
        val body = bounds.insetBy(width / 2)
        val radius = (bounds.width * CallMontageSoloLayout.BODY_RADIUS - width / 2).toFloat()
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            color = gray(0.28)
            strokeWidth = width.toFloat()
        }
        canvas.drawRoundRect(CallMontageInk.rectF(body), radius, radius, paint)
    }

    private fun reflection(canvas: Canvas, points: List<Pair<Float, Float>>) {
        val first = points.firstOrNull() ?: return
        val path = Path().apply {
            moveTo(first.first, first.second)
            points.drop(1).forEach { lineTo(it.first, it.second) }
            close()
        }
        canvas.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = gray(1.0, 0.06) })
    }

    /** L'heure de la séance à gauche, la signature à droite — hors des coins arrondis de l'écran. */
    private fun statusBar(canvas: Canvas, screen: CallFrameRect, band: CallFrameRect, cornerRadius: Double, caption: CallMontageCaption, reach: Double) {
        val inset = cornerRadius * 0.75
        caption.clock?.takeIf { it.isNotEmpty() }?.let { clock ->
            val size = band.height * 0.5
            drawTextLeft(canvas, clock, CallMontageFont.DEMI, size, gray(1.0), screen.minX + inset, band.midY + size * 0.35, screen.width * 0.3)
        }
        brand(canvas, unit = reach, share = BRAND_SMALL, cx = screen.maxX - inset, cy = band.midY, alignRight = true)
    }

    private fun tints(canvas: Canvas, mosaic: CallMontageSoloMosaic) {
        mosaic.tiles.forEachIndexed { index, tile ->
            val tint = CallMontageSoloLayout.tint(index / mosaic.columns, index % mosaic.columns)
            if (tint.alpha > 0) fill(canvas, tile, rgb(tint.red, tint.green, tint.blue, tint.alpha))
        }
    }

    private fun joints(canvas: Canvas, mosaic: CallMontageSoloMosaic) {
        val color = gray(1.0, 0.95)
        val tiles = mosaic.tiles
        (1 until mosaic.columns).forEach { column ->
            fill(canvas, CallFrameRect(tiles[column - 1].maxX, mosaic.slot.minY, mosaic.joint, mosaic.slot.height), color)
        }
        (1 until mosaic.rows).forEach { row ->
            fill(canvas, CallFrameRect(mosaic.slot.minX, tiles[(row - 1) * mosaic.columns].maxY, mosaic.slot.width, mosaic.joint), color)
        }
    }

    /**
     * La signature « ≡ meeshy » : les trois traits de la marque puis le mot, en blanc, centrée sur ([cx], [cy])
     * — ou finissant à [cx] quand [alignRight] est vrai.
     */
    private fun brand(canvas: Canvas, unit: Double, share: Double, cx: Double, cy: Double, alignRight: Boolean?) {
        val px = (unit * share).toFloat()
        val logoHeight = px * 0.62f
        val bounds = BrandMarkGeometry.dashes.let { dashes ->
            val half = GLYPH_DASH_WIDTH / 2
            floatArrayOf(dashes.minOf { it.startX } - half, dashes.minOf { it.y } - half, dashes.maxOf { it.endX } + half, dashes.maxOf { it.y } + half)
        }
        val scale = logoHeight / (bounds[3] - bounds[1])
        val logoWidth = (bounds[2] - bounds[0]) * scale
        val word = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = CallMontageFont.BOLD.typeface
            textSize = px
            color = gray(1.0)
            setShadowLayer(px * 0.06f, 0f, 0f, gray(0.0, 0.28))
        }
        val width = logoWidth + px * 0.32f + word.measureText(CallFrameText.BRAND_WORD)
        val left = if (alignRight == true) cx.toFloat() - width else cx.toFloat() - width / 2
        val top = cy.toFloat() - logoHeight / 2
        val ink = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeWidth = GLYPH_DASH_WIDTH * scale
            color = gray(1.0)
        }
        BrandMarkGeometry.dashes.forEach { dash ->
            ink.alpha = (dash.restingAlpha * 255).toInt()
            val y = top + (dash.y - bounds[1]) * scale
            canvas.drawLine(left + (dash.startX - bounds[0]) * scale, y, left + (dash.endX - bounds[0]) * scale, y, ink)
        }
        canvas.drawText(CallFrameText.BRAND_WORD, left + logoWidth + px * 0.32f, cy.toFloat() + px * 0.32f, word)
    }

    private fun CallFrameRect.insetBy(amount: Double) = CallFrameRect(x + amount, y + amount, width - amount * 2, height - amount * 2)
}
