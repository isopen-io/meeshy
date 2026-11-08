package me.meeshy.sdk.playback

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import me.meeshy.sdk.model.playback.NowPlayingArtworkPlan
import kotlin.math.max

/**
 * **Dessine l'image carrée de la carte de lecture** (miroir de `NowPlayingArtwork.compose` d'iOS) :
 * l'avatar plein cadre (aspect-fill) + l'icône de l'app en badge en bas à gauche ; sans avatar, l'icône
 * plein cadre ; rien du tout ⇒ `null`. Les proportions viennent de [NowPlayingArtworkPlan].
 */
public object NowPlayingArtworkRenderer {

    public fun compose(avatar: Bitmap?, appIcon: Bitmap?, side: Int = NowPlayingArtworkPlan.CANVAS_SIDE): Bitmap? {
        if (avatar == null && appIcon == null) return null
        val canvasBitmap = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(canvasBitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        if (avatar == null) {
            canvas.drawBitmap(requireNotNull(appIcon), null, Rect(0, 0, side, side), paint)
            return canvasBitmap
        }
        drawAspectFill(canvas, avatar, side, paint)
        val badge = appIcon?.let { NowPlayingArtworkPlan.badgeRect(hasAvatar = true, side = side) } ?: return canvasBitmap
        val bounds = RectF(
            badge.left.toFloat(),
            badge.top.toFloat(),
            (badge.left + badge.size).toFloat(),
            (badge.top + badge.size).toFloat(),
        )
        val radius = NowPlayingArtworkPlan.badgeCornerRadius(badge.size)
        val clip = Path().apply { addRoundRect(bounds, radius, radius, Path.Direction.CW) }
        canvas.save()
        canvas.clipPath(clip)
        canvas.drawBitmap(appIcon, null, bounds, paint)
        canvas.restore()
        return canvasBitmap
    }

    private fun drawAspectFill(canvas: Canvas, image: Bitmap, side: Int, paint: Paint) {
        if (image.width <= 0 || image.height <= 0) return
        val scale = max(side.toFloat() / image.width, side.toFloat() / image.height)
        val width = image.width * scale
        val height = image.height * scale
        val target = RectF((side - width) / 2f, (side - height) / 2f, (side + width) / 2f, (side + height) / 2f)
        canvas.drawBitmap(image, null, target, paint)
    }
}
