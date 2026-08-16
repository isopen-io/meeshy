package me.meeshy.ui.component.media

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.graphics.painter.Painter
import me.meeshy.sdk.model.media.ThumbHash
import me.meeshy.sdk.model.media.ThumbHashImage

/**
 * Decodes a base64 ThumbHash (`ApiPostMedia.thumbHash`) into a Compose [Painter] for
 * use as a Coil `AsyncImage`'s `placeholder` — the blur-placeholder-for-all-media
 * feature (feature-parity §P). `null` for an absent/malformed hash, so the caller's
 * existing flat-tint fallback stays visible underneath instead of a crash.
 *
 * The pixel work ([ThumbHash.decodeBase64] → [Bitmap]) is the one piece that must
 * touch the Android framework — [ThumbHash] itself stays pure JVM in `:core:model`.
 */
@Composable
fun rememberThumbHashPainter(base64: String?): Painter? = remember(base64) {
    ThumbHash.decodeBase64(base64)?.let { BitmapPainter(it.toBitmap().asImageBitmap()) }
}

private fun ThumbHashImage.toBitmap(): Bitmap {
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val pixels = IntArray(width * height)
    var byteIndex = 0
    for (p in pixels.indices) {
        val r = rgba[byteIndex].toInt() and 0xFF
        val g = rgba[byteIndex + 1].toInt() and 0xFF
        val b = rgba[byteIndex + 2].toInt() and 0xFF
        val a = rgba[byteIndex + 3].toInt() and 0xFF
        pixels[p] = (a shl 24) or (r shl 16) or (g shl 8) or b
        byteIndex += 4
    }
    bitmap.setPixels(pixels, 0, width, 0, 0, width, height)
    return bitmap
}
