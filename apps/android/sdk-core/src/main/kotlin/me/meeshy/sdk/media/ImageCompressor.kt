package me.meeshy.sdk.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.os.Build
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.model.media.ImageCompressionPlan
import me.meeshy.sdk.model.media.ImageCompressionPlanner
import me.meeshy.sdk.model.media.ImageOutputFormat
import me.meeshy.sdk.model.media.ImageSource
import me.meeshy.sdk.model.media.ImageSourceFormat
import me.meeshy.sdk.model.media.ImageUploadContext

/** Une image prête à partir : octets, type MIME et extension qui lui correspondent. */
public data class CompressedImage(
    val bytes: ByteArray,
    val mimeType: String,
    val fileExtension: String,
    val recompressed: Boolean,
) {
    override fun equals(other: Any?): Boolean =
        other is CompressedImage && bytes.contentEquals(other.bytes) &&
            mimeType == other.mimeType && fileExtension == other.fileExtension &&
            recompressed == other.recompressed

    override fun hashCode(): Int = bytes.contentHashCode() * 31 + mimeType.hashCode()
}

/**
 * Allège une image avant l'envoi — miroir de `MediaCompressor.compressImageData` d'iOS.
 * Le plafond vient du contexte, l'orientation EXIF est cuite dans les pixels (le plan se
 * calcule sur les dimensions ORIENTÉES), jpeg/png/webp gardent extension et MIME, un GIF
 * ou une image animée part tel quel. Toute erreur de décodage rend l'original, étiqueté
 * du type détecté : jamais une image perdue.
 */
@Singleton
public class ImageCompressor @Inject constructor(
    @DefaultDispatcher private val dispatcher: CoroutineDispatcher,
) {

    public suspend fun compress(
        bytes: ByteArray,
        context: ImageUploadContext,
        quality: Int = ImageCompressionPlanner.DEFAULT_QUALITY,
    ): CompressedImage = withContext(dispatcher) {
        runCatching { compressNow(bytes, context, quality) }.getOrElse { original(bytes, ImageSourceFormat.sniff(bytes)) }
    }

    private fun compressNow(bytes: ByteArray, context: ImageUploadContext, quality: Int): CompressedImage {
        val format = ImageSourceFormat.sniff(bytes)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return original(bytes, format)

        val orientation = readOrientation(bytes, format)
        val swap = orientation in SWAPPING_ORIENTATIONS
        val source = ImageSource(
            format = format,
            widthPx = if (swap) bounds.outHeight else bounds.outWidth,
            heightPx = if (swap) bounds.outWidth else bounds.outHeight,
            animated = ImageSourceFormat.isAnimated(bytes, format),
        )
        val plan = ImageCompressionPlanner.planFor(source, context, quality)
        if (plan.passthrough) return original(bytes, format)
        return reencode(bytes, bounds, orientation, plan, format)
    }

    private fun reencode(
        bytes: ByteArray,
        bounds: BitmapFactory.Options,
        orientation: Int,
        plan: ImageCompressionPlan,
        format: ImageSourceFormat,
    ): CompressedImage {
        val targetLongest = maxOf(plan.targetWidthPx, plan.targetHeightPx)
        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSize(maxOf(bounds.outWidth, bounds.outHeight), targetLongest)
        }
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return original(bytes, format)
        val oriented = orient(decoded, orientation, plan)
        val encoded = encode(oriented, plan)
        if (oriented !== decoded) decoded.recycle()
        oriented.recycle()

        val keepOriginal = !plan.resizeRequired && orientation == ExifInterface.ORIENTATION_NORMAL &&
            format == ImageSourceFormat.JPEG && encoded.size >= bytes.size
        if (keepOriginal) return original(bytes, format)
        return CompressedImage(encoded, plan.outputFormat.mimeType, plan.outputFormat.fileExtension, recompressed = true)
    }

    private fun orient(bitmap: Bitmap, orientation: Int, plan: ImageCompressionPlan): Bitmap {
        val matrix = Matrix().apply { applyOrientation(orientation) }
        val swap = orientation in SWAPPING_ORIENTATIONS
        val orientedWidth = if (swap) bitmap.height else bitmap.width
        val orientedHeight = if (swap) bitmap.width else bitmap.height
        if (orientedWidth > plan.targetWidthPx || orientedHeight > plan.targetHeightPx) {
            matrix.postScale(
                plan.targetWidthPx.toFloat() / orientedWidth,
                plan.targetHeightPx.toFloat() / orientedHeight,
            )
        }
        if (matrix.isIdentity) return bitmap
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun Matrix.applyOrientation(orientation: Int) {
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

    private fun encode(bitmap: Bitmap, plan: ImageCompressionPlan): ByteArray {
        val output = ByteArrayOutputStream()
        val compressFormat = when (plan.outputFormat) {
            ImageOutputFormat.PNG -> Bitmap.CompressFormat.PNG
            ImageOutputFormat.WEBP ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    Bitmap.CompressFormat.WEBP_LOSSY
                } else {
                    @Suppress("DEPRECATION")
                    Bitmap.CompressFormat.WEBP
                }
            ImageOutputFormat.JPEG, ImageOutputFormat.GIF -> Bitmap.CompressFormat.JPEG
        }
        bitmap.compress(compressFormat, plan.quality, output)
        return output.toByteArray()
    }

    private fun readOrientation(bytes: ByteArray, format: ImageSourceFormat): Int {
        val hasExif = format == ImageSourceFormat.JPEG || format == ImageSourceFormat.HEIC ||
            format == ImageSourceFormat.WEBP || format == ImageSourceFormat.PNG
        if (!hasExif) return ExifInterface.ORIENTATION_NORMAL
        return runCatching {
            ExifInterface(ByteArrayInputStream(bytes))
                .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
    }

    private fun original(bytes: ByteArray, format: ImageSourceFormat): CompressedImage {
        val output = ImageOutputFormat.forSource(format)
        return CompressedImage(bytes, output.mimeType, output.fileExtension, recompressed = false)
    }

    private companion object {
        val SWAPPING_ORIENTATIONS = setOf(
            ExifInterface.ORIENTATION_TRANSPOSE,
            ExifInterface.ORIENTATION_ROTATE_90,
            ExifInterface.ORIENTATION_TRANSVERSE,
            ExifInterface.ORIENTATION_ROTATE_270,
        )

        fun sampleSize(sourceLongest: Int, targetLongest: Int): Int {
            var sample = 1
            while (sourceLongest / (sample * 2) >= targetLongest) sample *= 2
            return sample
        }
    }
}
