package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import java.io.ByteArrayInputStream
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas

/**
 * Les pixels DEBOUT d'une prise : décodée au plus près de [ComposerLookCanvas.EXPORT_LONG_SIDE] (jamais
 * 12 Mpx en mémoire pour une toile de 2 560 px), l'orientation EXIF cuite. `null` si les octets ne se décodent pas.
 */
public object RetouchSourceDecoder {

    public fun decode(bytes: ByteArray, longSide: Int = ComposerLookCanvas.EXPORT_LONG_SIDE): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(maxOf(bounds.outWidth, bounds.outHeight), longSide) }
        val decoded = runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) }.getOrNull() ?: return null
        val matrix = orientation(bytes)
        if (matrix.isIdentity) return decoded
        return runCatching { Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true) }.getOrNull() ?: decoded
    }

    /** La plus grande puissance de deux qui garde le grand côté au-dessus de [target]. */
    internal fun sampleSize(sourceLongest: Int, target: Int): Int {
        var sample = 1
        while (target > 0 && sourceLongest / (sample * 2) >= target) sample *= 2
        return sample
    }

    private fun orientation(bytes: ByteArray): Matrix {
        val value = runCatching {
            ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        return Matrix().apply {
            when (value) {
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)
                ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)
                ExifInterface.ORIENTATION_TRANSPOSE -> { postRotate(90f); postScale(-1f, 1f) }
                ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)
                ExifInterface.ORIENTATION_TRANSVERSE -> { postRotate(270f); postScale(-1f, 1f) }
                ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(270f)
            }
        }
    }
}
