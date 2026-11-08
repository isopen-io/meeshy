package me.meeshy.ui.sticker.template

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Build
import android.util.SizeF
import kotlin.math.ceil
import kotlin.math.max

/**
 * Les gestes de dessin que tous les gabarits partagent — miroir de `StickerTemplateDrawing` (iOS) : chacun écrit une
 * fois, pour que les décorations aient un air de famille. Les mesures sont en dp ; [rasterize] projette sur la densité.
 */
internal object StickerTemplateDrawing {

    /** Chaque cadre plie son texte à neuf corps de large : un sticker qui s'étire sur toute la scène n'est plus une décoration. */
    const val WRAP_BODIES: Float = 9f

    const val SEMIBOLD: Int = 600
    const val BOLD: Int = 700
    const val HEAVY: Int = 800
    const val MEDIUM: Int = 500

    private fun typeface(weight: Int): Typeface {
        val styled = if (weight >= SEMIBOLD) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return styled
        return runCatching { Typeface.create(Typeface.DEFAULT, weight, false) }.getOrDefault(styled)
    }

    /** La police d'un gabarit : arrondie de corps, semi-grasse par défaut — la même dans la feuille et la scène. */
    fun font(size: Float, weight: Int = SEMIBOLD, color: Int = Color.BLACK): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.typeface = typeface(weight)
        this.textSize = size
        this.color = color
    }

    /** La police chiffrée des horloges — chiffres à chasse FIXE : « 11:11 » et « 20:48 » occupent la même largeur. */
    fun digitFont(size: Float, weight: Int = BOLD, color: Int = Color.BLACK): Paint = font(size, weight, color).apply {
        fontFeatureSettings = "tnum"
    }

    fun measure(text: String, paint: Paint): SizeF {
        val metrics = paint.fontMetrics
        return SizeF(paint.measureText(text), metrics.descent - metrics.ascent)
    }

    fun lineHeight(paint: Paint): Float = paint.fontMetrics.let { it.descent - it.ascent }

    /**
     * Le repli de ligne : les mots s'accumulent tant que la ligne tient dans [maxWidth] (mesurée par [widthOf]) ; un mot
     * plus long que la ligne est coupé. Pure, donc la même sur tous les appareils pour une même mesure.
     */
    fun wrapLines(text: String, maxWidth: Float, widthOf: (String) -> Float): List<String> {
        val lines = mutableListOf<String>()
        text.split('\n').forEach { paragraph ->
            var current = ""
            paragraph.split(' ').filter { it.isNotEmpty() }.forEach { word ->
                val candidate = if (current.isEmpty()) word else "$current $word"
                when {
                    widthOf(candidate) <= maxWidth -> current = candidate
                    current.isNotEmpty() -> {
                        lines += current
                        current = ""
                        splitLongWord(word, maxWidth, widthOf).let { parts ->
                            lines += parts.dropLast(1)
                            current = parts.last()
                        }
                    }
                    else -> splitLongWord(word, maxWidth, widthOf).let { parts ->
                        lines += parts.dropLast(1)
                        current = parts.last()
                    }
                }
            }
            lines += current
        }
        return lines.ifEmpty { listOf("") }
    }

    private fun splitLongWord(word: String, maxWidth: Float, widthOf: (String) -> Float): List<String> {
        if (widthOf(word) <= maxWidth) return listOf(word)
        val parts = mutableListOf<String>()
        var current = ""
        word.forEach { char ->
            if (current.isNotEmpty() && widthOf(current + char) > maxWidth) {
                parts += current
                current = ""
            }
            current += char
        }
        parts += current
        return parts
    }

    /** La taille du texte plié à [maxWidth] : sa plus longue ligne, et toutes ses lignes. */
    fun measureWrapped(text: String, paint: Paint, maxWidth: Float): SizeF {
        val lines = wrapLines(text, maxWidth) { paint.measureText(it) }
        val widest = lines.maxOf { paint.measureText(it) }
        return SizeF(ceil(max(widest, paint.textSize * 0.6f)), ceil(lines.size * lineHeight(paint)))
    }

    fun drawCentered(canvas: Canvas, text: String, paint: Paint, rect: RectF) {
        val metrics = paint.fontMetrics
        paint.textAlign = Paint.Align.CENTER
        canvas.drawText(text, rect.centerX(), rect.centerY() - (metrics.ascent + metrics.descent) / 2f, paint)
    }

    fun drawWrapped(canvas: Canvas, text: String, paint: Paint, rect: RectF) {
        val lines = wrapLines(text, rect.width() + 0.5f) { paint.measureText(it) }
        val height = lineHeight(paint)
        val top = rect.centerY() - lines.size * height / 2f
        lines.forEachIndexed { index, line ->
            drawCentered(canvas, line, paint, RectF(rect.left, top + index * height, rect.right, top + (index + 1) * height))
        }
    }

    private fun fill(color: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color; style = Paint.Style.FILL }

    fun fillPath(canvas: Canvas, path: Path, color: Int) = canvas.drawPath(path, fill(color))

    /** Un fond en dégradé vertical, du haut vers le bas de [rect]. */
    fun fillGradient(canvas: Canvas, path: Path, top: Int, bottom: Int, rect: RectF) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(rect.centerX(), rect.top, rect.centerX(), rect.bottom, top, bottom, Shader.TileMode.CLAMP)
        }
        canvas.drawPath(path, paint)
    }

    /**
     * Trace PUIS remplit : sur un tracé composé (nuage, bulle), le remplissage recouvre les arcs intérieurs du trait, et
     * seul le bord extérieur reste.
     */
    fun fillWithOutline(canvas: Canvas, path: Path, fill: Int, outline: Int, width: Float) {
        canvas.drawPath(path, strokePaint(outline, width))
        fillPath(canvas, path, fill)
    }

    fun fillWithOutline(canvas: Canvas, path: Path, top: Int, bottom: Int, rect: RectF, outline: Int, width: Float) {
        canvas.drawPath(path, strokePaint(outline, width))
        fillGradient(canvas, path, top, bottom, rect)
    }

    private fun strokePaint(color: Int, width: Float) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
        style = Paint.Style.STROKE
        strokeWidth = width * 2
        strokeJoin = Paint.Join.ROUND
    }

    /**
     * Le contexte de rastérisation partagé : bitmap NON opaque (une décoration se pose SUR une scène, un fond opaque y
     * ferait un timbre blanc), à l'échelle de l'écran. `null` pour une taille dégénérée.
     */
    fun rasterize(size: SizeF, density: Float, draw: (Canvas) -> Unit): Bitmap? {
        if (size.width <= 0f || size.height <= 0f || density <= 0f) return null
        val bitmap = Bitmap.createBitmap(ceil(size.width * density).toInt().coerceAtLeast(1), ceil(size.height * density).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.scale(density, density)
        draw(canvas)
        return bitmap
    }

    // region Glyphes et cartouches

    sealed interface Glyph {
        data class Symbol(val name: String) : Glyph
        data class Emoji(val emoji: String) : Glyph
        /** Le cadre est RÉSERVÉ et l'appelant y dessine lui-même. */
        data object Custom : Glyph
        data object None : Glyph
    }

    /** Un symbole inconnu ne dessine rien ; un emoji se peint à la taille du cadre. */
    fun drawGlyph(canvas: Canvas, glyph: Glyph, rect: RectF) {
        val text = when (glyph) {
            is Glyph.Symbol -> StickerTemplateIcons.glyph(glyph.name)
            is Glyph.Emoji -> glyph.emoji
            Glyph.Custom, Glyph.None -> null
        } ?: return
        drawCentered(canvas, text, font(rect.height() * 0.80f, MEDIUM), rect)
    }

    /** La mesure d'un cartouche « glyphe + légende » : la brique de la majorité des décorations à mot. */
    class CaptionLayout(val paint: Paint, val textSize: SizeF, val glyph: Float, val size: SizeF)

    fun captionLayout(
        caption: String,
        glyph: Glyph,
        metrics: StickerTemplateMetrics,
        textScale: Float = 0.78f,
        weight: Int = HEAVY,
        extraHeight: Float = 0f,
    ): CaptionLayout {
        val paint = font(metrics.fontSize * textScale, weight)
        val text = measure(caption, paint)
        val glyphSide = if (glyph == Glyph.None) 0f else metrics.fontSize * 1.05f
        val between = if (glyph == Glyph.None) 0f else metrics.gap
        return CaptionLayout(
            paint,
            text,
            glyphSide,
            SizeF(
                ceil(metrics.horizontalPadding * 2 + glyphSide + between + text.width),
                ceil(metrics.verticalPadding * 2 + max(glyphSide, text.height) + extraHeight),
            ),
        )
    }

    /** Le contenu d'un cartouche — glyphe à gauche, légende à droite — dans [rect] ; la FORME est dessinée avant. */
    fun drawCaptionContent(
        canvas: Canvas,
        layout: CaptionLayout,
        caption: String,
        glyph: Glyph,
        metrics: StickerTemplateMetrics,
        rect: RectF,
        textColor: Int,
    ) {
        var x = rect.left + metrics.horizontalPadding
        if (layout.glyph > 0f) {
            drawGlyph(canvas, glyph, RectF(x, rect.centerY() - layout.glyph / 2f, x + layout.glyph, rect.centerY() + layout.glyph / 2f))
            x += layout.glyph + metrics.gap
        }
        layout.paint.color = textColor
        val line = RectF(x, rect.centerY() - layout.textSize.height / 2f, x + layout.textSize.width, rect.centerY() + layout.textSize.height / 2f)
        layout.paint.textAlign = Paint.Align.LEFT
        val metricsFont = layout.paint.fontMetrics
        canvas.drawText(caption, line.left, line.centerY() - (metricsFont.ascent + metricsFont.descent) / 2f, layout.paint)
    }

    // endregion
}
