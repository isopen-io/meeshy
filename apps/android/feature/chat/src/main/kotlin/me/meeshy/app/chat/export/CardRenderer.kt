package me.meeshy.app.chat.export

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Build
import kotlin.math.hypot

/** Une carte peinte : ses pixels, sa taille en pixels de la CARTE, ses zones et si elle a été coupée. */
class CardImage(
    val bitmap: Bitmap,
    val layoutWidth: Double,
    val layoutHeight: Double,
    val regions: List<CardRegion>,
    val truncated: Boolean,
)

/**
 * LA PEINTURE D'UNE CARTE — la moitié impure de la mise en page (miroir de `MessageCardRenderer`).
 * UN SEUL moteur pour l'aperçu, l'image exportée et les vignettes : ils ne diffèrent que par
 * l'échelle. Aucun appel ici ne doit tenir le thread principal : l'appelant la lance sur
 * `Dispatchers.Default`.
 */
object CardRenderer {

    /** Les polices de story d'iOS, portées sur les familles du système (aucune police n'est embarquée). */
    internal fun typeface(face: CardFace): Typeface = when (face) {
        is CardFace.Native -> nativeFace(face.weight, face.italic)
        is CardFace.Story -> when (face.style) {
            StoryFace.BUBBLE -> Typeface.create("sans-serif-medium", Typeface.NORMAL)
            StoryFace.ELEGANT -> Typeface.create("serif", Typeface.NORMAL)
            StoryFace.BRUSH -> Typeface.create("cursive", Typeface.NORMAL)
            StoryFace.NOTE -> Typeface.create("casual", Typeface.NORMAL)
            StoryFace.POSTER -> Typeface.create("sans-serif-black", Typeface.NORMAL)
            StoryFace.FUTURISTIC -> Typeface.create("sans-serif-condensed", Typeface.BOLD)
            StoryFace.RETRO -> Typeface.create("monospace", Typeface.NORMAL)
            StoryFace.TAG -> Typeface.create("sans-serif-black", Typeface.ITALIC)
        }
    }

    /**
     * La graisse exacte n'existe qu'à l'API 28 ; en deçà (minSdk 26), la famille du système ne
     * connaît que normal et gras — on y projette la graisse, plutôt que de planter.
     */
    internal fun nativeFace(weight: Int, italic: Boolean, sdkInt: Int = Build.VERSION.SDK_INT): Typeface =
        if (sdkInt >= Build.VERSION_CODES.P) {
            Typeface.create(Typeface.DEFAULT, weight.coerceIn(100, 900), italic)
        } else {
            Typeface.create(Typeface.DEFAULT, legacyStyle(weight, italic))
        }

    internal fun legacyStyle(weight: Int, italic: Boolean): Int = when {
        weight >= 600 && italic -> Typeface.BOLD_ITALIC
        weight >= 600 -> Typeface.BOLD
        italic -> Typeface.ITALIC
        else -> Typeface.NORMAL
    }

    /** La mesure réelle : un `Paint` par police, résolu une fois. */
    class Fonts {
        private val paints = HashMap<CardFont, Paint>()

        fun paint(font: CardFont): Paint = paints.getOrPut(font) {
            Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
                typeface = typeface(font.face)
                textSize = font.size.toFloat()
            }
        }

        val measure: CardMeasure = { text, font -> paint(font).measureText(text).toDouble() }
    }

    fun layout(input: CardInput, fonts: Fonts = Fonts()): CardLayout = CardLayoutEngine.layout(input, fonts.measure)

    /**
     * L'aperçu et l'export : la carte peinte à [targetWidth] pixels de large (la taille de la carte si `null`). [pictures] porte
     * l'image de chaque média déjà chargée, par identifiant ; une tuile sans la sienne se peint en attente.
     */
    fun render(input: CardInput, targetWidth: Int? = null, pictures: Map<String, Bitmap> = emptyMap()): CardImage {
        val fonts = Fonts()
        val layout = layout(input, fonts)
        val scale = targetWidth?.let { it / layout.width } ?: 1.0
        return CardImage(draw(layout, input, scale, fonts, pictures), layout.width, layout.height, layout.regions, layout.truncated)
    }

    /** La VIGNETTE d'un template : la même carte, peinte à [width] pixels, traits portés à une épaisseur lisible. */
    fun thumbnail(input: CardInput, width: Int, pictures: Map<String, Bitmap> = emptyMap()): Bitmap {
        val fonts = Fonts()
        val full = layout(input, fonts)
        val scale = width / full.width
        return draw(full.legible(scale), input, scale, fonts, pictures)
    }

    private fun draw(layout: CardLayout, input: CardInput, scale: Double, fonts: Fonts, pictures: Map<String, Bitmap> = emptyMap()): Bitmap {
        val bitmap = Bitmap.createBitmap(
            maxOf(1, (layout.width * scale).toInt()), maxOf(1, (layout.height * scale).toInt()), Bitmap.Config.ARGB_8888,
        )
        val canvas = Canvas(bitmap)
        canvas.scale(scale.toFloat(), scale.toFloat())
        val palette = input.template.palette.palette
        paintBackground(canvas, layout, palette)
        paintWatermark(canvas, layout, palette, fonts)
        val painter = OpPainter(fonts, palette, pictures)
        layout.ops.forEach { painter.paint(canvas, it) }
        return bitmap
    }

    private fun paintBackground(canvas: Canvas, layout: CardLayout, palette: CardPalette) {
        val w = layout.width.toFloat()
        val h = layout.height.toFloat()
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(
                0f, 0f, w * 0.35f, h,
                palette.background.map { it.color.toArgb() }.toIntArray(),
                palette.background.map { it.offset.toFloat() }.toFloatArray(),
                Shader.TileMode.CLAMP,
            )
        }
        canvas.drawRect(0f, 0f, w, h, paint)
        val glow = palette.glow ?: return
        val radial = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(
                w * 0.85f, h * 0.12f, w * 0.9f,
                intArrayOf(glow.toArgb(), glow.copy(alpha = 0.0).toArgb()), floatArrayOf(0f, 1f), Shader.TileMode.CLAMP,
            )
        }
        canvas.drawRect(0f, 0f, w, h, radial)
    }

    /** Le filigrane : « Meeshy @pseudo », en diagonale, répété sur toute la carte. */
    private fun paintWatermark(canvas: Canvas, layout: CardLayout, palette: CardPalette, fonts: Fonts) {
        val font = CardFont(CardFace.system(700), 34.0)
        val paint = Paint(fonts.paint(font)).apply { color = palette.watermarkInk.toArgb(palette.watermarkAlpha) }
        val step = paint.measureText("${layout.watermark}    ")
        if (step <= 0f) return
        val span = hypot(layout.width, layout.height).toFloat()
        canvas.save()
        canvas.translate(layout.width.toFloat() / 2, layout.height.toFloat() / 2)
        canvas.rotate(-180f / 7f)
        var row = -span / 2
        while (row < span / 2) {
            val shift = ((row / 150f) % 2f) * (step / 2f)
            var x = -span / 2 - step + shift
            while (x < span / 2) {
                canvas.drawText(layout.watermark, x, row, paint)
                x += step
            }
            row += 150f
        }
        canvas.restore()
    }

    private class OpPainter(val fonts: Fonts, val palette: CardPalette, val pictures: Map<String, Bitmap>) {
        fun paint(canvas: Canvas, op: CardOp) {
            when (op) {
                is CardOp.Text -> paintText(canvas, op, fonts)
                is CardOp.Bar -> roundRect(canvas, op.x, op.y, op.width, op.height, op.radius, op.color)
                is CardOp.Panel -> roundRect(canvas, op.x, op.y, op.width, op.height, op.radius, op.color)
                is CardOp.Dot -> canvas.drawCircle(
                    op.x.toFloat(), op.y.toFloat(), op.radius.toFloat(),
                    Paint(Paint.ANTI_ALIAS_FLAG).apply { color = op.color.toArgb() },
                )
                is CardOp.Separator -> paintSeparator(canvas, op)
                is CardOp.Picture -> CardPicturePainter.paint(canvas, op, pictures[op.media.id], palette, fonts)
                is CardOp.Group -> {
                    canvas.save()
                    canvas.rotate(Math.toDegrees(op.rotation).toFloat(), op.cx.toFloat(), op.cy.toFloat())
                    op.ops.forEach { paint(canvas, it) }
                    canvas.restore()
                }
            }
        }
    }

    private fun paintText(canvas: Canvas, op: CardOp.Text, fonts: Fonts) {
        val paint = Paint(fonts.paint(op.font)).apply { color = op.color.toArgb() }
        val width = paint.measureText(op.text)
        val offset = when (op.align) {
            CardAlignment.LEFT -> 0f
            CardAlignment.RIGHT -> -width
            CardAlignment.CENTER -> -width / 2
        }
        canvas.drawText(op.text, op.x.toFloat() + offset, op.y.toFloat(), paint)
    }

    private fun roundRect(canvas: Canvas, x: Double, y: Double, w: Double, h: Double, radius: Double, color: CardColor) {
        val r = minOf(radius, w / 2, h / 2).coerceAtLeast(0.0).toFloat()
        canvas.drawRoundRect(
            RectF(x.toFloat(), y.toFloat(), (x + w).toFloat(), (y + h).toFloat()), r, r,
            Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color.toArgb() },
        )
    }

    private fun paintSeparator(canvas: Canvas, op: CardOp.Separator) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = op.color.toArgb()
            style = Paint.Style.STROKE
            strokeWidth = op.lineWidth.toFloat()
            strokeCap = Paint.Cap.ROUND
            if (op.dash.isNotEmpty()) pathEffect = android.graphics.DashPathEffect(op.dash.map { it.toFloat() }.toFloatArray(), 0f)
        }
        val y = op.y.toFloat()
        if (op.radius == 0.0) {
            canvas.drawLine(op.x1.toFloat(), y, op.x2.toFloat(), y, paint)
            return
        }
        val middle = ((op.x1 + op.x2) / 2).toFloat()
        val gap = (op.radius + 18).toFloat()
        canvas.drawLine(op.x1.toFloat(), y, middle - gap, y, paint)
        canvas.drawLine(middle + gap, y, op.x2.toFloat(), y, paint)
        paint.pathEffect = null
        canvas.drawCircle(middle, y, op.radius.toFloat(), paint)
    }
}
