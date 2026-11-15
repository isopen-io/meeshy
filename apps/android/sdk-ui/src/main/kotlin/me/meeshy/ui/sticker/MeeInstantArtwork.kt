package me.meeshy.ui.sticker

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.Dp
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.sticker.MeeInstant
import me.meeshy.sdk.model.sticker.MeeInstantBand
import me.meeshy.sdk.model.sticker.MeeInstantBandLayout
import me.meeshy.sdk.model.sticker.MeeInstantCatalog
import me.meeshy.sdk.model.sticker.MeeInstantClip
import me.meeshy.sdk.model.sticker.MeeInstantText
import me.meeshy.sdk.model.sticker.MeeSlot
import me.meeshy.sdk.model.sticker.MeeTextAnchor
import me.meeshy.ui.component.game.MeeFigure

/**
 * Un Instant de Mee ou Meo (#14345) — la même vue dans la feuille et dans la bulle, comme iOS `MeeInstantView` : le
 * film (fixe ou animé), et le texte saisi redessiné par-dessus, à la place que l'index a mesurée.
 */
@Composable
public fun MeeInstantArtwork(
    instant: MeeInstant,
    typed: Map<MeeSlot, String>,
    side: Dp,
    modifier: Modifier = Modifier,
    animates: Boolean = true,
    bleeds: Boolean = false,
) {
    Box(modifier.size(side)) {
        MeeFigure(filmId = instant.id, side = side, animates = animates, bleeds = bleeds)
        androidx.compose.foundation.Canvas(Modifier.matchParentSize()) {
            drawIntoCanvas { MeeInstantPainter.draw(it.nativeCanvas, instant, typed, size.width) }
        }
    }
}

/** Le texte d'un Instant, dessiné dans le repère du film (iOS `MeeInstantOverlay`) : la boîte de vue ramenée au côté. */
public object MeeInstantPainter {
    private const val BAND_STROKE = 2.4f
    private const val SUB_INK_ALPHA = 0.78f
    private const val BAND_CENTER_X = 100f

    public fun draw(canvas: Canvas, instant: MeeInstant, typed: Map<MeeSlot, String>, side: Float) {
        val box = MeeInstantCatalog.viewBox
        val k = side / box.width
        canvas.save()
        canvas.translate(-box.x * k, -box.y * k)
        canvas.scale(k, k)
        instant.band?.let { drawBand(canvas, instant, it, typed) }
        instant.texts.forEach { drawFree(canvas, instant, it, typed) }
        canvas.restore()
    }

    private fun drawBand(canvas: Canvas, instant: MeeInstant, band: MeeInstantBand, typed: Map<MeeSlot, String>) {
        val layout = MeeInstantBandLayout.of(
            main = instant.shown(band.main, typed).orEmpty(),
            sub = band.sub?.let { instant.shown(it, typed) },
        )
        val r = layout.rect
        val rect = RectF(r.x, r.y, r.x + r.width, r.y + r.height)
        canvas.drawRoundRect(rect, layout.cornerRadius, layout.cornerRadius, fill(band.fill))
        canvas.drawRoundRect(rect, layout.cornerRadius, layout.cornerRadius, stroke(band.stroke))
        text(canvas, layout.main, layout.mainSize, 900, opaque(band.ink), BAND_CENTER_X, layout.mainBaseline, MeeTextAnchor.MIDDLE, 0f)
        layout.sub?.let {
            text(canvas, it, layout.subSize, 700, withAlpha(band.ink, SUB_INK_ALPHA), BAND_CENTER_X, layout.subBaseline, MeeTextAnchor.MIDDLE, 0f)
        }
    }

    private fun drawFree(canvas: Canvas, instant: MeeInstant, text: MeeInstantText, typed: Map<MeeSlot, String>) {
        val raw = instant.shown(text.slot, typed).orEmpty().trim()
        val shown = text.max?.let { MeeInstantClip.clip(raw, it) } ?: raw
        text(
            canvas, shown, text.size(raw.length) * text.scale, text.weight, withAlpha(text.fill, text.opacity),
            text.x, text.y, text.anchor, text.rotation,
        )
    }

    /** Un texte posé par sa LIGNE DE BASE, comme un `<text>` SVG. */
    private fun text(
        canvas: Canvas, string: String, size: Float, weight: Int, color: Int,
        x: Float, y: Float, anchor: MeeTextAnchor, rotation: Float,
    ) {
        if (string.isEmpty()) return
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            textSize = size
            typeface = typeface(weight)
            textAlign = when (anchor) {
                MeeTextAnchor.START -> Paint.Align.LEFT
                MeeTextAnchor.MIDDLE -> Paint.Align.CENTER
                MeeTextAnchor.END -> Paint.Align.RIGHT
            }
        }
        canvas.save()
        canvas.translate(x, y)
        canvas.rotate(Math.toDegrees(rotation.toDouble()).toFloat())
        canvas.drawText(string, 0f, 0f, paint)
        canvas.restore()
    }

    private fun typeface(weight: Int): Typeface =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            Typeface.create(Typeface.DEFAULT, weight.coerceIn(1, 1000), false)
        } else {
            if (weight >= 600) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        }

    private fun fill(rgb: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = opaque(rgb); style = Paint.Style.FILL }

    private fun stroke(rgb: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = opaque(rgb)
        style = Paint.Style.STROKE
        strokeWidth = BAND_STROKE
    }

    private fun opaque(rgb: Int): Int = (0xFF shl 24) or (rgb and 0xFFFFFF)

    private fun withAlpha(rgb: Int, alpha: Float): Int = ((alpha.coerceIn(0f, 1f) * 255).toInt() shl 24) or (rgb and 0xFFFFFF)
}

/**
 * L'image FIXE d'un Instant (iOS `MeeInstant.stillImage(slots:)`) : la première image du film et le texte saisi posé
 * dessus — le PNG joint au message, repli des lecteurs qui ne redessinent pas. `null` pour un film illisible.
 */
public object MeeInstantStill {
    public suspend fun bitmap(context: Context, instant: MeeInstant, typed: Map<MeeSlot, String>, side: Int = MeeStickerStill.DEFAULT_SIDE): Bitmap? {
        val film = MeeStickerStill.bitmap(context, instant.id, side) ?: return null
        return withContext(Dispatchers.Default) {
            runCatching {
                film.copy(Bitmap.Config.ARGB_8888, true).also { MeeInstantPainter.draw(Canvas(it), instant, typed, side.toFloat()) }
            }.getOrNull()
        }
    }

    public suspend fun png(context: Context, instant: MeeInstant, typed: Map<MeeSlot, String>, side: Int = MeeStickerStill.DEFAULT_SIDE): ByteArray? {
        val bitmap = bitmap(context, instant, typed, side) ?: return null
        return withContext(Dispatchers.Default) {
            runCatching { ByteArrayOutputStream().use { out -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, out); out.toByteArray() } }.getOrNull()
        }
    }
}
