package me.meeshy.sdk.call.frames

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.os.Build
import me.meeshy.sdk.call.frames.CallFrameRendererKit.fillPaint
import me.meeshy.sdk.call.frames.CallFrameRendererKit.rectF
import me.meeshy.sdk.call.frames.CallFrameRendererKit.strokePaint
import me.meeshy.sdk.call.frames.CallFrameRendererKit.toPath
import me.meeshy.sdk.call.frames.CallFrameRendererKit.withShadow
import me.meeshy.sdk.model.call.frames.CallFrameColor
import me.meeshy.sdk.model.call.frames.CallFramePlaceholder
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit
import me.meeshy.sdk.model.call.frames.CallFrameShapeGeometry
import me.meeshy.sdk.model.call.frames.CallFrameSlotBox
import me.meeshy.sdk.model.call.frames.CallFrameToneBlend
import me.meeshy.sdk.model.call.frames.CallFrameToneLayer
import me.meeshy.sdk.model.call.frames.CallFrameToneRecipe
import kotlin.math.min

/**
 * Les cases et ce qui les entoure — le port de `CallFrameRenderer+Shapes.swift` : sous les visages les
 * cartes, ombres et halos ; le visage lui-même (image ou portrait absent) avec son ton, découpé dans la
 * forme de la case ; au-dessus les traits de case. Les contours viennent de [CallFrameShapeGeometry].
 */
internal object CallFrameRendererShapes {
    private val BLACK = CallFrameColor(0.0, 0.0, 0.0, 1.0)
    private val WHITE = CallFrameColor(1.0, 1.0, 1.0, 1.0)

    /** Exécute [body] dans le repère de la case : tourné de `box.rotation` degrés autour de son centre. */
    private inline fun inBox(canvas: Canvas, box: CallFrameSlotBox, body: () -> Unit) {
        canvas.save()
        if (box.rotation != 0.0) canvas.rotate(box.rotation.toFloat(), box.rect.midX.toFloat(), box.rect.midY.toFloat())
        body()
        canvas.restore()
    }

    // MARK: sous les visages : cartes, ombres, halos

    fun paintUnderlay(canvas: Canvas, box: CallFrameSlotBox, stage: CallFrameStage) {
        val slot = stage.look.slot
        val unit = stage.unit
        val photo = CallFrameRenderKit.photoRect(box.rect, slot.card)
        val side = min(photo.width, photo.height)
        val face = toPath(CallFrameShapeGeometry.slotPath(box, photo, slot))
        inBox(canvas, box) {
            slot.card?.let { card ->
                val blur = if (slot.shadow) 0.03 else 0.014
                val offset = if (slot.shadow) 0.01 else 0.004
                val alpha = if (slot.shadow) 0.38 else 0.18
                val paint = fillPaint(CallFrameRenderKit.color(card.color))
                    .withShadow(unit * blur, CallFrameColor(0.0, 0.0, 0.0, alpha), unit * offset)
                canvas.drawRect(rectF(box.rect), paint)
            }
            slot.glow?.let { glow ->
                val ink = CallFrameRenderKit.color(glow)
                val paint = fillPaint(ink).withShadow(side * 0.12, ink)
                canvas.drawPath(face, paint)
                canvas.drawPath(face, paint)
            }
            if (slot.shadow && slot.card == null) {
                val paint = fillPaint(CallFrameColor(17 / 255.0, 17 / 255.0, 17 / 255.0, 1.0))
                    .withShadow(unit * 0.03, CallFrameColor(0.0, 0.0, 0.0, 0.42), unit * 0.012)
                canvas.drawPath(face, paint)
            }
        }
    }

    // MARK: les visages

    fun drawFace(canvas: Canvas, portrait: CallFramePortrait, box: CallFrameSlotBox, stage: CallFrameStage) {
        val slot = stage.look.slot
        val photo = CallFrameRenderKit.photoRect(box.rect, slot.card)
        if (photo.width <= 0 || photo.height <= 0) return
        val path = toPath(CallFrameShapeGeometry.slotPath(box, photo, slot))
        val recipe = CallFrameToneRecipe.of(slot.tone, slot.duotone)
        inBox(canvas, box) {
            canvas.save()
            canvas.clipPath(path)
            drawToned(canvas, photo, recipe) {
                val image = portrait.image
                if (portrait.hasImage && image != null) {
                    canvas.drawRect(rectF(photo), fillPaint(BLACK))
                    drawImageFill(canvas, image, photo)
                } else {
                    drawPlaceholder(canvas, portrait.person, photo)
                }
            }
            recipe.layers.forEach { blend(canvas, photo, it) }
            canvas.restore()
        }
    }

    /** Dessine [body] dans une couche dont la saturation est celle du ton (un filtre de couleur, exact à toute version). */
    private inline fun drawToned(canvas: Canvas, area: CallFrameRect, recipe: CallFrameToneRecipe, body: () -> Unit) {
        if (recipe.saturation == 1.0) {
            body()
            return
        }
        val filter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(recipe.saturation.toFloat()) })
        val count = canvas.saveLayer(rectF(area), Paint().apply { colorFilter = filter })
        body()
        canvas.restoreToCount(count)
    }

    private fun drawImageFill(canvas: Canvas, image: Bitmap, target: CallFrameRect) {
        val drawn = CallFrameRenderKit.aspectFill(image.width.toDouble(), image.height.toDouble(), target) ?: return
        canvas.save()
        canvas.clipRect(rectF(target))
        canvas.drawBitmap(image, null, rectF(drawn), Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
        canvas.restore()
    }

    /** Caméra coupée : un dégradé propre à la personne et son initiale, jamais une case retirée (§ 2). */
    fun drawPlaceholder(canvas: Canvas, person: CallFramePerson, photo: CallFrameRect) {
        val hues = CallFramePlaceholder.hues(person.id)
        canvas.save()
        canvas.clipRect(rectF(photo))
        CallFrameRendererKit.fillRect(
            canvas,
            photo,
            CallFrameRendererKit.linearShader(
                listOf(CallFrameRenderKit.color(hues.first), CallFrameRenderKit.color(hues.second)),
                photo.minX, photo.minY, photo.maxX, photo.maxY,
            ),
        )
        canvas.restore()
        val initial = CallFramePlaceholder.initial(person.name) ?: return
        val size = min(photo.width, photo.height) * 0.36
        if (size < 1) return
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CallFrameRendererKit.argb(WHITE, 0.94)
            textSize = size.toFloat()
            textAlign = Paint.Align.CENTER
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setShadowLayer(CallFrameRendererKit.shadowRadius(size * 0.12), 0f, 0f, CallFrameRendererKit.argb(BLACK, 0.18))
        }
        val metrics = paint.fontMetrics
        val baseline = photo.midY - (metrics.ascent + metrics.descent) / 2 + size * 0.04
        canvas.drawText(initial, photo.midX.toFloat(), baseline.toFloat(), paint)
    }

    private fun blend(canvas: Canvas, area: CallFrameRect, layer: CallFrameToneLayer) {
        val paint = fillPaint(layer.color)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            paint.blendMode = when (layer.blend) {
                CallFrameToneBlend.NORMAL -> android.graphics.BlendMode.SRC_OVER
                CallFrameToneBlend.COLOR -> android.graphics.BlendMode.COLOR
                CallFrameToneBlend.SOFT_LIGHT -> android.graphics.BlendMode.SOFT_LIGHT
                CallFrameToneBlend.MULTIPLY -> android.graphics.BlendMode.MULTIPLY
                CallFrameToneBlend.SCREEN -> android.graphics.BlendMode.SCREEN
                CallFrameToneBlend.LIGHTEN -> android.graphics.BlendMode.LIGHTEN
            }
        } else {
            paint.xfermode = PorterDuffXfermode(
                when (layer.blend) {
                    CallFrameToneBlend.NORMAL, CallFrameToneBlend.COLOR -> PorterDuff.Mode.SRC_OVER
                    CallFrameToneBlend.SOFT_LIGHT -> PorterDuff.Mode.OVERLAY
                    CallFrameToneBlend.MULTIPLY -> PorterDuff.Mode.MULTIPLY
                    CallFrameToneBlend.SCREEN -> PorterDuff.Mode.SCREEN
                    CallFrameToneBlend.LIGHTEN -> PorterDuff.Mode.LIGHTEN
                },
            )
        }
        canvas.drawRect(rectF(area), paint)
    }

    // MARK: au-dessus des visages : les traits de case

    fun paintSlotStroke(canvas: Canvas, box: CallFrameSlotBox, stage: CallFrameStage) {
        val slot = stage.look.slot
        val stroke = slot.stroke ?: return
        val width = kotlin.math.max(0.75, stroke.width * stage.unit)
        val photo = CallFrameRenderKit.photoRect(box.rect, slot.card)
        val ink = CallFrameRenderKit.color(stroke.color)
        inBox(canvas, box) {
            canvas.drawPath(toPath(CallFrameShapeGeometry.slotPath(box, photo, slot)), strokePaint(ink, width))
            if (slot.double) {
                val inner = CallFrameRenderKit.inset(photo, width * 2.2)
                canvas.drawPath(
                    toPath(CallFrameShapeGeometry.slotPath(box, inner, slot)),
                    strokePaint(CallFrameRenderKit.tint(stroke.color, 0.9), width * 0.4),
                )
            }
        }
    }
}
