package me.meeshy.ui.sticker.template

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.PI
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Le contour blanc découpé d'un sticker — celui de Mee et Meo, porté aux gabarits (miroir de `StickerDieCut`, iOS).
 * Un papier blanc qui déborde du dessin de 1,6 % de son côté le plus long, peint sur seize directions (une dilatation que
 * la plus fine des lettres d'un cartouche ne traverse pas), et une ombre d'encre douce décalée vers le bas.
 *
 * Une COUCHE DE PRÉSENTATION : la feuille, la bulle et le PNG envoyé la portent ; la scène d'une story, dont la
 * géométrie est celle du document, ne la porte JAMAIS.
 */
public object StickerDieCut {
    /** La part du côté le plus long que le papier déborde. */
    public const val OUTLINE_RATIO: Float = 0.016f
    public const val MINIMUM_OUTLINE: Float = 2f
    public const val DIRECTIONS: Int = 16
    public const val SHADOW_ALPHA: Float = 0.26f

    /** L'encre de l'ombre : indigo très sombre à 26 % d'opacité. */
    public val ink: Int = Color.argb((SHADOW_ALPHA * 255).roundToInt(), 28, 25, 65)

    /** Le débordement du papier, en dp, pour un dessin de [width] × [height] dp. */
    public fun outline(width: Float, height: Float): Float = max(MINIMUM_OUTLINE, max(width, height) * OUTLINE_RATIO)

    /** Le papier, puis l'ombre qui déborde de lui : la marge ajoutée sur CHAQUE bord, en dp. */
    public fun margin(width: Float, height: Float): Float = ceil(outline(width, height) * 2.6f)

    /** Le décalage vertical de l'ombre, en dp : vers le bas. */
    internal fun shadowOffset(width: Float, height: Float): Float = outline(width, height) * 0.7f

    /** [source] : le dessin à [density] ; rend le dessin entouré, plus grand de la marge sur chaque bord. */
    public fun apply(source: Bitmap, density: Float): Bitmap {
        if (source.width <= 0 || source.height <= 0 || density <= 0f) return source
        val widthDp = source.width / density
        val heightDp = source.height / density
        val radius = outline(widthDp, heightDp) * density
        val margin = margin(widthDp, heightDp) * density
        val out = Bitmap.createBitmap(
            ceil(source.width + 2 * margin).toInt(),
            ceil(source.height + 2 * margin).toInt(),
            Bitmap.Config.ARGB_8888,
        )
        val paper = Bitmap.createBitmap(out.width, out.height, Bitmap.Config.ARGB_8888)
        val paperCanvas = Canvas(paper)
        val white = Paint(Paint.ANTI_ALIAS_FLAG).apply { colorFilter = PorterDuffColorFilter(Color.WHITE, PorterDuff.Mode.SRC_IN) }
        listOf(radius, radius * 0.5f).forEach { ring ->
            repeat(DIRECTIONS) { step ->
                val angle = step.toDouble() / DIRECTIONS * 2 * PI
                paperCanvas.drawBitmap(source, margin + (cos(angle) * ring).toFloat(), margin + (sin(angle) * ring).toFloat(), white)
            }
        }
        val canvas = Canvas(out)
        runCatching { drawShadow(canvas, paper, radius) }
        canvas.drawBitmap(paper, 0f, 0f, null)
        canvas.drawBitmap(source, margin, margin, null)
        return out
    }

    /** L'ombre d'encre : l'alpha du papier, flouté, décalé vers le bas de 0,7 fois le débordement. */
    private fun drawShadow(canvas: Canvas, paper: Bitmap, radius: Float) {
        val blur = Paint(Paint.ANTI_ALIAS_FLAG).apply { maskFilter = BlurMaskFilter((radius * 1.5f).coerceAtLeast(1f), BlurMaskFilter.Blur.NORMAL) }
        val offset = IntArray(2)
        val alpha = paper.extractAlpha(blur, offset) ?: return
        val shade = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ink }
        canvas.drawBitmap(alpha, offset[0].toFloat(), offset[1] + radius * 0.7f, shade)
    }
}
