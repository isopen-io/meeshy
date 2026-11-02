package me.meeshy.app.widget.kit

import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.ui.graphics.toArgb
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.theme.hexColor

/**
 * Avatar rond à initiales rendu en bitmap (Glance ne dessine pas de formes) —
 * miroir de `InitialsAvatar` (MeeshyWidgets.swift) : disque d'accent, initiales
 * blanches ~40 % du diamètre, et pastille de présence 12 dp bordée de 2 dp
 * (jamais pour hors ligne ni présence inconnue).
 */
internal object WidgetAvatarBitmap {
    const val DOT_DP = 12
    const val DOT_BORDER_DP = 2
    private const val CACHE_CAPACITY = 24
    private const val TEXT_RATIO = 0.4f

    private val cache = WidgetAvatarCache<Bitmap>(CACHE_CAPACITY)

    fun render(context: Context, name: String, accentHex: String, sizeDp: Int, presence: String?): Bitmap {
        val night = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        val key = WidgetAvatarKey.of(name, accentHex, sizeDp, presence)
            .let { if (night) it.copy(accentHex = it.accentHex + "N") else it }
        return cache.getOrPut(key) { draw(context, key, accentHex, sizeDp, night) }
    }

    private fun draw(context: Context, key: WidgetAvatarKey, accentHex: String, sizeDp: Int, night: Boolean): Bitmap {
        val density = context.resources.displayMetrics.density
        val px = (sizeDp * density).toInt().coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val radius = px / 2f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = hexColor(accentHex).toArgb()
        canvas.drawCircle(radius, radius, radius, paint)
        paint.color = android.graphics.Color.WHITE
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        paint.textSize = px * TEXT_RATIO
        paint.textAlign = Paint.Align.CENTER
        val baseline = radius - (paint.descent() + paint.ascent()) / 2f
        canvas.drawText(key.initials, radius, baseline, paint)
        drawPresenceDot(canvas, key.presence, px, density, night)
        return bitmap
    }

    private fun drawPresenceDot(canvas: Canvas, presence: String, px: Int, density: Float, night: Boolean) {
        val dot = meeshyPresenceDotColor(WidgetPresence.parse(presence)?.state) ?: return
        val outer = DOT_DP * density / 2f
        val cx = px - outer
        val cy = px - outer
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = WidgetTheme.dotBorder(night).toArgb()
        canvas.drawCircle(cx, cy, outer, paint)
        paint.color = dot.toArgb()
        canvas.drawCircle(cx, cy, outer - DOT_BORDER_DP * density, paint)
    }
}
