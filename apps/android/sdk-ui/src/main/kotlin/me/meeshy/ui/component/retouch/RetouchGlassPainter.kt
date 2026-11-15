package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import kotlin.math.ceil
import kotlin.math.max
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.composer.look.ComposerRetouchBake
import me.meeshy.sdk.model.scene.StoryTextBackground

/**
 * **LES VITRES DES TEXTES À FOND VERRE** (iOS `StoryStaticSnapshot.glassPanes`, `LensPass.frosted`, #12602) : sous
 * la boîte d'un texte Verre, ce qui est déjà peint se floute. Le flou travaille sur la seule région de la boîte,
 * réduite pour que son rayon reste de quelques pixels — le coût suit la boîte, jamais la photo entière.
 */
internal object RetouchGlassPainter {
    private const val DESIGN_WIDTH = 1080f
    private const val TARGET_RADIUS_PX = 3f
    private const val MARGIN_SIGMAS = 2f

    /** Floute [base] sous la boîte de [text] et dépose le résultat sur [canvas] (qui peint dans [base]). */
    fun frost(base: Bitmap, canvas: Canvas, text: StoryTextObject) {
        val pane = pane(text, base.width.toFloat(), base.height.toFloat()) ?: return
        val region = pane.region(base.width, base.height) ?: return
        val blurred = blurred(base, region, pane.sigma) ?: return
        canvas.save()
        canvas.clipPath(pane.path)
        canvas.drawBitmap(blurred, null, RectF(region), Paint(Paint.FILTER_BITMAP_FLAG))
        canvas.restore()
        blurred.recycle()
    }

    /**
     * Le temps de repos du geste avant de refrotter les vitres de l'aperçu : un glissé change l'empreinte à chaque
     * image, et chaque vitre coûte une toile de la taille de l'aperçu — sans ce repos, le S8 en allouerait une par
     * image pour la jeter aussitôt. Le délai est annulable ; le calcul, une fois lancé, ne l'est pas.
     */
    const val SETTLE_MILLIS: Long = 48L

    fun hasGlass(texts: List<StoryTextObject>): Boolean = texts.any { it.text.isNotBlank() && ComposerRetouchBake.isGlass(it) }

    /** Les seules vitres des textes Verre de [texts], sur une toile transparente de la taille de [base] ; `null` sans verre. */
    fun panes(base: Bitmap, texts: List<StoryTextObject>): Bitmap? {
        val glass = ComposerRetouchBake.runs(texts.filter { it.text.isNotBlank() }).mapNotNull { it.glass }
        if (glass.isEmpty()) return null
        val out = runCatching { Bitmap.createBitmap(base.width, base.height, Bitmap.Config.ARGB_8888) }.getOrNull() ?: return null
        val canvas = Canvas(out)
        glass.forEach { frost(base, canvas, it) }
        return out
    }

    internal class Pane(val path: Path, val bounds: RectF, val sigma: Float) {
        fun region(width: Int, height: Int): Rect? {
            val margin = sigma * MARGIN_SIGMAS
            val rect = Rect(
                (bounds.left - margin).toInt().coerceAtLeast(0),
                (bounds.top - margin).toInt().coerceAtLeast(0),
                ceil(bounds.right + margin).toInt().coerceAtMost(width),
                ceil(bounds.bottom + margin).toInt().coerceAtMost(height),
            )
            return rect.takeIf { it.width() > 0 && it.height() > 0 }
        }
    }

    internal fun pane(text: StoryTextObject, width: Float, height: Float): Pane? {
        val glass = StoryTextBackground.resolve(text.backgroundStyle, text.textBg) as? StoryTextBackground.Glass ?: return null
        val layout = RetouchTextPainter.layoutOf(text, width)
        val box = RetouchTextPainter.box(text, layout, width)
        val radius = RetouchTextPainter.cornerRadius(text, box, width)
        val path = Path().apply { addRoundRect(box, radius, radius, Path.Direction.CW) }
        val matrix: Matrix = RetouchTextPainter.placement(text, width, height)
        path.transform(matrix)
        val bounds = RectF().also { path.computeBounds(it, true) }
        return Pane(path, bounds, (glass.radius * width / DESIGN_WIDTH).toFloat())
    }

    private fun blurred(base: Bitmap, region: Rect, sigma: Float): Bitmap? {
        val crop = runCatching { Bitmap.createBitmap(base, region.left, region.top, region.width(), region.height()) }.getOrNull() ?: return null
        val factor = max(1, ceil(sigma / TARGET_RADIUS_PX).toInt())
        val small = runCatching {
            Bitmap.createScaledBitmap(crop, max(1, crop.width / factor), max(1, crop.height / factor), true)
        }.getOrNull()
        val width = small?.width ?: 0
        val height = small?.height ?: 0
        val pixels = IntArray(width * height).also { small?.getPixels(it, 0, width, 0, 0, width, height) }
        if (small !== crop) small?.recycle()
        if (crop !== base) crop.recycle()
        if (small == null) return null
        val soft = RetouchBoxBlur.blur(pixels, width, height, RetouchBoxBlur.radiusFor(sigma / factor))
        return runCatching { Bitmap.createBitmap(soft, width, height, Bitmap.Config.ARGB_8888) }.getOrNull()
    }
}
