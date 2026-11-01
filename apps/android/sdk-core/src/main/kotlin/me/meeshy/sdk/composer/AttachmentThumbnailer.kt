package me.meeshy.sdk.composer

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.composer.PendingAttachmentType

/** Ce que la préparation d'une pièce apprend de son fichier : vignette, dimensions, durée, teinte. */
data class AttachmentThumbnail(
    val thumbnailPath: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val durationMs: Long? = null,
    val colorHex: String? = null,
)

/** Génère la vignette d'une pièce ; `null` = rien à montrer (le plateau garde une icône). */
interface AttachmentThumbnailing {
    suspend fun thumbnail(file: File, type: PendingAttachmentType, outputDir: File, id: String): AttachmentThumbnail?
}

/**
 * Vignette image (échantillonnée), image-clé vidéo, durée audio. Tout échec rend `null` :
 * une pièce sans vignette reste envoyable.
 */
class AttachmentThumbnailer @Inject constructor(
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : AttachmentThumbnailing {

    override suspend fun thumbnail(
        file: File,
        type: PendingAttachmentType,
        outputDir: File,
        id: String,
    ): AttachmentThumbnail? = withContext(ioDispatcher) {
        runCatching {
            when (type) {
                PendingAttachmentType.IMAGE -> imageThumbnail(file, outputDir, id)
                PendingAttachmentType.VIDEO -> videoThumbnail(file, outputDir, id)
                PendingAttachmentType.AUDIO -> audioInfo(file)
                PendingAttachmentType.FILE -> null
            }
        }.getOrNull()
    }

    private fun imageThumbnail(file: File, outputDir: File, id: String): AttachmentThumbnail? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val decode = BitmapFactory.Options().apply { inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight) }
        val decoded = BitmapFactory.decodeFile(file.path, decode) ?: return null
        val orientation = exifOrientation(file)
        val upright = upright(decoded, orientation)
        val swaps = orientation in SWAPPING_ORIENTATIONS
        val width = if (swaps) bounds.outHeight else bounds.outWidth
        val height = if (swaps) bounds.outWidth else bounds.outHeight
        return saved(upright, outputDir, id)?.copy(width = width, height = height)
    }

    /** `BitmapFactory` ignore l'EXIF : une prise de l'objectif arriverait couchée, et ses dimensions inversées. */
    private fun exifOrientation(file: File): Int = runCatching {
        ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
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
        return runCatching { Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true) }.getOrDefault(bitmap)
    }

    private fun videoThumbnail(file: File, outputDir: File, id: String): AttachmentThumbnail? {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(file.path)
            val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
            val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
            val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
            val frame = retriever.getFrameAtTime(0L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            val base = frame?.let { saved(it, outputDir, id) } ?: AttachmentThumbnail()
            val learned = base.copy(width = width, height = height, durationMs = duration)
            return learned.takeUnless { it == AttachmentThumbnail() }
        } finally {
            runCatching { retriever.release() }
        }
    }

    private fun audioInfo(file: File): AttachmentThumbnail? {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(file.path)
            val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
            return duration?.let { AttachmentThumbnail(durationMs = it) }
        } finally {
            runCatching { retriever.release() }
        }
    }

    private fun saved(bitmap: Bitmap, outputDir: File, id: String): AttachmentThumbnail? {
        outputDir.mkdirs()
        val target = File(outputDir, "$id.thumb.jpg")
        target.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
        return AttachmentThumbnail(thumbnailPath = target.path, colorHex = averageColorHex(bitmap))
    }

    private fun averageColorHex(bitmap: Bitmap): String? {
        if (bitmap.width <= 0 || bitmap.height <= 0) return null
        val pixel = Bitmap.createScaledBitmap(bitmap, 1, 1, true).getPixel(0, 0)
        return "%06X".format(pixel and 0xFFFFFF)
    }

    private fun sampleSize(width: Int, height: Int): Int {
        var sample = 1
        while (width / (sample * 2) >= MAX_EDGE_PX && height / (sample * 2) >= MAX_EDGE_PX) sample *= 2
        return sample
    }

    private companion object {
        const val MAX_EDGE_PX = 512
        const val JPEG_QUALITY = 80
        val SWAPPING_ORIENTATIONS = setOf(
            ExifInterface.ORIENTATION_TRANSPOSE,
            ExifInterface.ORIENTATION_ROTATE_90,
            ExifInterface.ORIENTATION_TRANSVERSE,
            ExifInterface.ORIENTATION_ROTATE_270,
        )
    }
}
