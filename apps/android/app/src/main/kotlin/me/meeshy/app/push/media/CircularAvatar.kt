package me.meeshy.app.push.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import java.io.File

/** Avatar de notification rendu en disque (style communication), à partir d'un fichier borné. */
object CircularAvatar {

    private const val TARGET_PX = 192

    fun decode(file: File): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        val side = minOf(bounds.outWidth, bounds.outHeight)
        if (side <= 0) return null
        val options = BitmapFactory.Options().apply { inSampleSize = (side / TARGET_PX).coerceAtLeast(1) }
        val source = BitmapFactory.decodeFile(file.path, options) ?: return null
        return circular(source)
    }

    fun circular(source: Bitmap): Bitmap {
        val size = minOf(source.width, source.height)
        val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        val left = (source.width - size) / 2
        val top = (source.height - size) / 2
        canvas.drawBitmap(source, Rect(left, top, left + size, top + size), Rect(0, 0, size, size), paint)
        return output
    }
}
