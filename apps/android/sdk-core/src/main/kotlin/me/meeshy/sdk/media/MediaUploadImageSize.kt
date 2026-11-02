package me.meeshy.sdk.media

import android.graphics.BitmapFactory
import android.media.ExifInterface

/**
 * The size a photo is SEEN in — its decoded bounds, turned by its EXIF orientation — read in streams, without decoding a
 * pixel. `null` for anything that is not a decodable image. This is what a scene of a post of photos needs as its
 * `aspectRatio` while the photo still waits on the device (#13612): iOS measures every photo it poses.
 */
public object MediaUploadImageSize {
    private val SWAPPING_ORIENTATIONS = setOf(
        ExifInterface.ORIENTATION_TRANSPOSE,
        ExifInterface.ORIENTATION_ROTATE_90,
        ExifInterface.ORIENTATION_TRANSVERSE,
        ExifInterface.ORIENTATION_ROTATE_270,
    )

    public fun of(item: MediaUploadItem): Pair<Int, Int>? = runCatching {
        if (!item.mimeType.startsWith("image/", ignoreCase = true)) return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        item.source.open().use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        if (orientationOf(item) in SWAPPING_ORIENTATIONS) bounds.outHeight to bounds.outWidth else bounds.outWidth to bounds.outHeight
    }.getOrNull()

    private fun orientationOf(item: MediaUploadItem): Int = runCatching {
        item.source.open().use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
    }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
}
