package me.meeshy.sdk.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import java.io.File
import java.io.InputStream

/** Ré-encode une image lisible en une copie bornée, debout, sans aucune métadonnée de l'original (#15970). */
public fun interface SanitizedImageEncoding {
    /** Écrit dans [target] la copie de l'image que [open] relit ; `false` quand elle ne se décode pas. */
    public fun encode(open: () -> InputStream, target: File): Boolean
}

/**
 * **La copie nette d'une photo en attente ne porte RIEN de l'original que ses pixels.** Les octets sont décodés puis
 * réécrits en JPEG par `Bitmap.compress`, qui n'écrit aucun bloc EXIF / XMP / IPTC : ni GPS, ni appareil, ni date. Les
 * pixels sont redressés selon l'orientation EXIF (la copie n'en porte plus) et bornés à [MAX_EDGE_PX] sur le grand côté —
 * deux fois la largeur d'un écran de téléphone, de quoi zoomer net sans tenir 12 Mpx en mémoire.
 *
 * L'échantillonnage du décodage garde le bitmap décodé sous deux fois la borne : une photo de 48 Mpx est lue au quart.
 */
public object SanitizedImageEncoder : SanitizedImageEncoding {
    public const val MAX_EDGE_PX: Int = 3072
    private const val JPEG_QUALITY = 88

    override fun encode(open: () -> InputStream, target: File): Boolean {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        open().use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return false
        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(maxOf(bounds.outWidth, bounds.outHeight)) }
        val decoded = open().use { BitmapFactory.decodeStream(it, null, options) } ?: return false
        val upright = upright(bounded(decoded), orientationOf(open))
        return try {
            written(upright, target)
        } finally {
            upright.recycle()
        }
    }

    private fun written(bitmap: Bitmap, target: File): Boolean {
        val parent = target.parentFile ?: return false
        parent.mkdirs()
        val staged = File(parent, target.name + ".part")
        try {
            val compressed = staged.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
            return compressed && staged.renameTo(target)
        } finally {
            staged.delete()
        }
    }

    private fun sampleSize(longEdge: Int): Int {
        var sample = 1
        while (longEdge / (sample * 2) >= MAX_EDGE_PX) sample *= 2
        return sample
    }

    private fun bounded(bitmap: Bitmap): Bitmap {
        val longEdge = maxOf(bitmap.width, bitmap.height)
        if (longEdge <= MAX_EDGE_PX) return bitmap
        val scale = MAX_EDGE_PX.toFloat() / longEdge
        val width = (bitmap.width * scale).toInt().coerceAtLeast(1)
        val height = (bitmap.height * scale).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(bitmap, width, height, true).also { if (it !== bitmap) bitmap.recycle() }
    }

    private fun orientationOf(open: () -> InputStream): Int = runCatching {
        open().use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
    }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)

    private fun upright(bitmap: Bitmap, orientation: Int): Bitmap {
        val matrix = Matrix().apply {
            when (orientation) {
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)
                ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)
                ExifInterface.ORIENTATION_TRANSPOSE -> { postRotate(90f); postScale(-1f, 1f) }
                ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)
                ExifInterface.ORIENTATION_TRANSVERSE -> { postRotate(270f); postScale(-1f, 1f) }
                ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(270f)
            }
        }
        if (matrix.isIdentity) return bitmap
        val rotated = runCatching { Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true) }.getOrNull() ?: return bitmap
        if (rotated !== bitmap) bitmap.recycle()
        return rotated
    }
}
