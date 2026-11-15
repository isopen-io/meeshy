package me.meeshy.sdk.call.frames

import android.graphics.Canvas
import android.graphics.Paint
import me.meeshy.sdk.call.frames.CallFrameRendererKit.argb
import me.meeshy.sdk.call.frames.CallFrameRendererKit.shadowRadius
import me.meeshy.sdk.model.call.frames.CallFrameBrand
import me.meeshy.sdk.model.call.frames.CallFrameBrandBox
import me.meeshy.sdk.model.call.frames.CallFrameBrandMark
import me.meeshy.sdk.model.call.frames.CallFrameBrandPlace
import me.meeshy.sdk.model.call.frames.CallFrameColor
import me.meeshy.sdk.model.call.frames.CallFrameFont
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit
import me.meeshy.sdk.model.call.frames.CallFrameText
import me.meeshy.sdk.model.call.frames.CallFrameTextEffect
import me.meeshy.sdk.model.call.frames.CallFrameTextLayout
import me.meeshy.sdk.model.call.frames.CallFrameTextPlan
import me.meeshy.sdk.model.call.frames.CallFrameTextPlanner
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max

private fun Double.f(): Float = toFloat()

/** L'alignement horizontal d'un texte autour de son abscisse. */
internal enum class CallFrameTextAlign { LEFT, CENTER, RIGHT }

/** Une ombre portée sous un texte : son flou CoreGraphics, sa couleur, son décalage vers le bas. */
internal data class CallFrameTextHalo(val blur: Double, val color: CallFrameColor, val dy: Double = 0.0)

/**
 * **LES TEXTES D'UN CADRE** (#13694) — la signature, le titre et le sous-titre, le port de `frame-paint-text.ts`
 * et de `CallFrameRenderer+Text.swift`. Où va chaque texte se décide dans `:core:model`
 * ([CallFrameTextPlanner]) ; ici, seul le tracé. Les textes se cuisent dans la couche DESSUS, une fois par
 * scène : aucune image n'en repeint un.
 *
 * Un texte se trace par `Canvas.drawText`, qui applique l'algorithme bidirectionnel : un nom arabe s'écrit
 * de droite à gauche, et l'ellipse d'un nom tronqué tombe à sa fin logique.
 */
internal object CallFrameRendererText {

    private fun gray(white: Double, alpha: Double) = CallFrameColor(white, white, white, alpha)

    /** Ce que les textes des réserves occupent, mesuré avec les polices de ce rendu. */
    fun layout(stage: CallFrameStage, fonts: CallFrameFontBook = CallFrameFontBook()): CallFrameTextLayout =
        CallFrameTextPlanner.layout(stage.textScene, fonts)

    /** Les textes, dans l'ordre du § 5.1 : noms, titre et sous-titre, signature. */
    fun paintTexts(canvas: Canvas, stage: CallFrameStage, plan: CallFrameTextPlan, fonts: CallFrameFontBook) {
        CallFrameRendererNames.paint(canvas, stage, plan, fonts)
        paintTitles(canvas, stage, plan, fonts)
        paintBrand(canvas, stage, plan, fonts)
    }

    // Tracer une ligne

    /** Un texte aligné sur [x], sa ligne médiane sur [y]. */
    fun drawText(canvas: Canvas, text: String, paint: Paint, x: Double, y: Double, align: CallFrameTextAlign) {
        if (text.isEmpty()) return
        val width = paint.measureText(text).toDouble()
        val left = when (align) {
            CallFrameTextAlign.LEFT -> x
            CallFrameTextAlign.CENTER -> x - width / 2
            CallFrameTextAlign.RIGHT -> x - width
        }
        val metrics = paint.fontMetrics
        val baseline = y + (-metrics.ascent - metrics.descent) / 2.0
        paint.textAlign = Paint.Align.LEFT
        canvas.drawText(text, left.f(), baseline.f(), paint)
    }

    /** `inkText` du web : le texte avec son effet (ombre, halo, contour) ; [halo] est l'ombre ambiante (celle de la signature). */
    fun inkText(
        canvas: Canvas,
        text: String,
        x: Double,
        y: Double,
        font: CallFrameFont?,
        px: Double,
        hex: String,
        fonts: CallFrameFontBook,
        ink: CallFrameColor? = null,
        effect: CallFrameTextEffect = CallFrameTextEffect.NONE,
        align: CallFrameTextAlign = CallFrameTextAlign.CENTER,
        alpha: Double = 1.0,
        halo: CallFrameTextHalo? = null,
    ) {
        if (text.isEmpty() || px < 1) return
        val fill = ink ?: CallFrameRenderKit.color(hex)
        val dark = CallFrameRenderKit.perceived(hex) < 0.45
        fun paint(color: CallFrameColor, shadow: CallFrameTextHalo?) = fonts.paint(font, px, argb(color, alpha)).apply {
            shadow?.let { setShadowLayer(shadowRadius(it.blur), 0f, it.dy.f(), argb(it.color, alpha)) }
        }
        when (effect) {
            CallFrameTextEffect.SHADOW -> {
                val shade = if (dark) gray(1.0, 0.35) else gray(0.0, 0.45)
                drawText(canvas, text, paint(fill, CallFrameTextHalo(px * 0.14, shade, px * 0.05)), x, y, align)
            }
            CallFrameTextEffect.GLOW -> {
                val light = CallFrameRenderKit.tint(hex, 0.85)
                drawText(canvas, text, paint(fill, CallFrameTextHalo(px * 0.4, light)), x, y, align)
                drawText(canvas, text, paint(fill, CallFrameTextHalo(px * 0.15, light)), x, y, align)
            }
            CallFrameTextEffect.OUTLINE -> {
                val outline = if (dark) gray(1.0, 0.9) else gray(0.0, 0.75)
                val stroke = paint(outline, null).apply {
                    style = Paint.Style.STROKE
                    strokeWidth = max(1.0, px * 0.09).f()
                    strokeJoin = Paint.Join.ROUND
                }
                drawText(canvas, text, stroke, x, y, align)
                drawText(canvas, text, paint(fill, null), x, y, align)
            }
            CallFrameTextEffect.NONE -> drawText(canvas, text, paint(fill, halo), x, y, align)
        }
    }

    // La signature

    /** Les trois traits de la marque, leur tracé visible calé sur ([x], [y]) coin haut-gauche, [height] de haut. */
    fun paintLogo(canvas: Canvas, x: Double, y: Double, height: Double, ink: CallFrameColor, alpha: Double = 1.0, halo: CallFrameTextHalo? = null) {
        val glyph = CallFrameTextPlanner.GLYPH_BOUNDS
        val scale = height / glyph.height
        val originX = x - glyph.minX * scale
        val originY = y - glyph.minY * scale
        CallFrameTextPlanner.DASHES.forEach { dash ->
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeCap = Paint.Cap.ROUND
                strokeWidth = (CallFrameTextPlanner.GLYPH_DASH_WIDTH * scale).f()
                color = argb(ink, alpha * dash.opacity)
                halo?.let { setShadowLayer(shadowRadius(it.blur), 0f, it.dy.f(), argb(it.color, alpha)) }
            }
            val dy = originY + dash.y * scale
            canvas.drawLine((originX + dash.startX * scale).f(), dy.f(), (originX + dash.endX * scale).f(), dy.f(), paint)
        }
    }

    fun paintBrandAt(
        canvas: Canvas,
        brand: CallFrameBrand,
        box: CallFrameBrandBox,
        cx: Double,
        cy: Double,
        scale: Double,
        fonts: CallFrameFontBook,
        alpha: Double = 1.0,
    ) {
        val px = box.px * scale
        val logoHeight = box.logoHeight * scale
        val left = cx - box.width * scale / 2
        val halo = CallFrameTextHalo(
            px * 0.12,
            if (CallFrameRenderKit.perceived(brand.color) > 0.5) gray(0.0, 0.28) else gray(1.0, 0.22),
        )
        if (brand.mark != CallFrameBrandMark.WORDMARK) {
            paintLogo(canvas, left, cy - logoHeight / 2, logoHeight, CallFrameRenderKit.color(brand.color), alpha, halo)
        }
        if (brand.mark != CallFrameBrandMark.LOGO) {
            val x = if (brand.mark == CallFrameBrandMark.BOTH) left + logoHeight * CallFrameTextPlanner.GLYPH_ASPECT + px * 0.32 else left
            inkText(
                canvas, CallFrameText.BRAND_WORD, x, cy - px * 0.04, brand.font, px, brand.color, fonts,
                align = CallFrameTextAlign.LEFT, alpha = alpha, halo = halo,
            )
        }
    }

    fun paintBrand(canvas: Canvas, stage: CallFrameStage, plan: CallFrameTextPlan, fonts: CallFrameFontBook) {
        val brand = stage.look.brand ?: return
        val box = CallFrameTextPlanner.brandBox(brand, stage.unit, fonts)
        val frame = CallFrameTextPlanner.brandFrame(stage.textScene, plan, box)
        if (frame == null) {
            if (brand.place == CallFrameBrandPlace.WATERMARK) paintWatermark(canvas, brand, box, stage, fonts)
            return
        }
        val scale = if (brand.place == CallFrameBrandPlace.TOP || brand.place == CallFrameBrandPlace.BOTTOM) plan.brandScale else 1.0
        paintBrandAt(canvas, brand, box, frame.midX, frame.midY, scale, fonts)
    }

    /** Le filigrane : la signature répétée en diagonale, très discrète, par-dessus l'ensemble. */
    fun paintWatermark(canvas: Canvas, brand: CallFrameBrand, box: CallFrameBrandBox, stage: CallFrameStage, fonts: CallFrameFontBook) {
        val width = stage.width.toDouble()
        val height = stage.height.toDouble()
        val reach = hypot(width, height)
        val stepX = max(1.0, box.width * 2.2)
        val stepY = max(1.0, box.height * 3.2)
        canvas.save()
        canvas.translate((width / 2).f(), (height / 2).f())
        canvas.rotate(Math.toDegrees(-Math.PI / 7).f())
        (0..ceil(reach / stepY).toInt()).forEach { row ->
            val y = -reach / 2 + row * stepY
            val offset = if (row % 2 == 0) 0.0 else stepX / 2
            (0 until ceil(reach / stepX).toInt() + 2).forEach { col ->
                paintBrandAt(canvas, brand, box, -reach / 2 + offset + col * stepX, y, 1.0, fonts, alpha = WATERMARK_ALPHA)
            }
        }
        canvas.restore()
    }

    const val WATERMARK_ALPHA: Double = 0.12

    // Titres

    fun paintTitles(canvas: Canvas, stage: CallFrameStage, plan: CallFrameTextPlan, fonts: CallFrameFontBook) {
        CallFrameTextPlanner.fittedTitles(stage.textScene, plan, fonts).forEach { fitted ->
            inkText(
                canvas, fitted.text, fitted.row.midX, fitted.row.midY, fitted.title.font, fitted.size, fitted.title.color, fonts,
                effect = fitted.title.servedEffect,
            )
        }
    }
}
