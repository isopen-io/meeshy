package me.meeshy.ui.sticker.template

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Les formes que les familles partagent — miroir de `StickerTemplateDrawing+Shapes` (iOS) : une étoile, un nuage, une
 * bulle, un cartouche, un cœur. Tracées plutôt qu'empruntées à un glyphe : un cœur emoji change de dessin d'une version
 * d'Android à l'autre, et une décoration doit se rendre pareil partout. Les tracés composés (nuage, bulle) se remplissent
 * en rempli non nul : l'union des sous-tracés.
 */
internal object StickerTemplateShapes {

    fun pill(rect: RectF): Path = Path().apply { addRoundRect(rect, rect.height() / 2f, rect.height() / 2f, Path.Direction.CW) }

    fun roundedRect(rect: RectF, radius: Float): Path = Path().apply { addRoundRect(rect, radius, radius, Path.Direction.CW) }

    /** Un cœur inscrit dans [rect], en courbes de Bézier. */
    fun heart(rect: RectF): Path {
        val l = rect.width()
        val h = rect.height()
        val x = rect.left
        val y = rect.top
        return Path().apply {
            moveTo(x + l / 2f, y + h)
            cubicTo(x + l * 0.14f, y + h * 0.76f, x, y + h * 0.56f, x, y + h * 0.30f)
            arcTo(RectF(x, y + h * 0.30f - l * 0.25f, x + l * 0.5f, y + h * 0.30f + l * 0.25f), 180f, 180f)
            arcTo(RectF(x + l * 0.5f, y + h * 0.30f - l * 0.25f, x + l, y + h * 0.30f + l * 0.25f), 180f, 180f)
            cubicTo(x + l, y + h * 0.56f, x + l * 0.86f, y + h * 0.76f, x + l / 2f, y + h)
            close()
        }
    }

    /** Une étoile à [points] branches inscrite dans [rect]. */
    fun star(rect: RectF, points: Int = 5, innerRatio: Float = 0.45f): Path {
        val radius = min(rect.width(), rect.height()) / 2f
        val path = Path()
        repeat(points * 2) { index ->
            val angle = -PI / 2 + index * PI / points
            val r = if (index % 2 == 0) radius else radius * innerRatio
            val px = rect.centerX() + (cos(angle) * r).toFloat()
            val py = rect.centerY() + (sin(angle) * r).toFloat()
            if (index == 0) path.moveTo(px, py) else path.lineTo(px, py)
        }
        path.close()
        return path
    }

    /** Un ÉCLAT — l'étoile à beaucoup de branches courtes des « WOW » et des « OMG ». */
    fun burst(rect: RectF, points: Int = 12, innerRatio: Float = 0.78f): Path = star(rect, points, innerRatio)

    /** Un nuage : l'union de trois disques et d'un socle arrondi. */
    fun cloud(rect: RectF): Path {
        val l = rect.width()
        val h = rect.height()
        return Path().apply {
            addRoundRect(RectF(rect.left, rect.top + h * 0.45f, rect.right, rect.bottom), h * 0.275f, h * 0.275f, Path.Direction.CW)
            addOval(RectF(rect.left + l * 0.12f, rect.top + h * 0.22f, rect.left + l * 0.54f, rect.top + h * 0.22f + l * 0.42f), Path.Direction.CW)
            addOval(RectF(rect.left + l * 0.38f, rect.top, rect.left + l * 0.88f, rect.top + l * 0.50f), Path.Direction.CW)
            addOval(RectF(rect.left + l * 0.60f, rect.top + h * 0.30f, rect.left + l * 0.94f, rect.top + h * 0.30f + l * 0.34f), Path.Direction.CW)
        }
    }

    /** Une bulle de dialogue : un cartouche arrondi et une queue en bas à gauche. */
    fun speechBubble(rect: RectF, tail: Float): Path {
        val body = RectF(rect.left, rect.top, rect.right, rect.bottom - tail)
        val radius = min(body.height() * 0.35f, tail * 1.6f)
        return Path().apply {
            addRoundRect(body, radius, radius, Path.Direction.CW)
            moveTo(body.left + body.width() * 0.18f, body.bottom - 1f)
            lineTo(body.left + body.width() * 0.12f, rect.bottom)
            lineTo(body.left + body.width() * 0.36f, body.bottom - 1f)
            close()
        }
    }

    /** Une bulle de PENSÉE : un nuage et deux perles vers le bas à gauche. */
    fun thoughtBubble(rect: RectF, tail: Float): Path {
        val body = RectF(rect.left, rect.top, rect.right, rect.bottom - tail)
        val large = tail * 0.48f
        val small = tail * 0.28f
        return Path().apply {
            addPath(cloud(body))
            addOval(RectF(body.left + body.width() * 0.16f, body.bottom - large * 0.35f, body.left + body.width() * 0.16f + large, body.bottom - large * 0.35f + large), Path.Direction.CW)
            addOval(RectF(body.left + body.width() * 0.08f, rect.bottom - small, body.left + body.width() * 0.08f + small, rect.bottom), Path.Direction.CW)
        }
    }

    /** Une goutte — la pluie, une larme. */
    fun drop(rect: RectF): Path {
        val l = rect.width()
        val h = rect.height()
        val centerY = rect.top + h * 0.62f
        return Path().apply {
            moveTo(rect.centerX(), rect.top)
            cubicTo(rect.centerX() + l * 0.10f, rect.top + h * 0.25f, rect.right, rect.top + h * 0.40f, rect.right, centerY)
            arcTo(RectF(rect.centerX() - l / 2f, centerY - l / 2f, rect.centerX() + l / 2f, centerY + l / 2f), 0f, 180f)
            cubicTo(rect.left, rect.top + h * 0.40f, rect.centerX() - l * 0.10f, rect.top + h * 0.25f, rect.centerX(), rect.top)
            close()
        }
    }

    /** Des rayons autour d'un centre — un soleil, une explosion de joie. */
    fun drawRays(canvas: Canvas, cx: Float, cy: Float, inner: Float, outer: Float, count: Int, width: Float, color: Int) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            style = Paint.Style.STROKE
            strokeWidth = width
            strokeCap = Paint.Cap.ROUND
        }
        repeat(count) { index ->
            val angle = index.toDouble() / count * 2 * PI
            canvas.drawLine(
                cx + (cos(angle) * inner).toFloat(), cy + (sin(angle) * inner).toFloat(),
                cx + (cos(angle) * outer).toFloat(), cy + (sin(angle) * outer).toFloat(), paint,
            )
        }
    }
}
