package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.MediaMetadataRetriever
import android.os.Build
import java.io.File
import kotlin.math.roundToInt

/**
 * Les images d'une vidéo posée par [MediaMetadataRetriever] : dès Android 9, par lots d'images CONSÉCUTIVES
 * (`getFramesAtIndex`, un seul décodage depuis l'image clé pour tout le lot) — l'export lit la source dans l'ordre —, et
 * avant, image par image à l'instant le plus proche. Une image rendue dans le sens de stockage d'une vidéo tournée est
 * redressée selon la rotation déclarée. Un échec se journalise une fois et rend `null` : le calque ne pose alors rien, et
 * la preuve de rendu le voit.
 */
internal class RetrieverVideoFrames(private val file: File) : PlacedVideoFrames {

    private val retriever = MediaMetadataRetriever()
    private var opened = false
    private var failed = false
    private var durationMillis = 0L
    private var frameCount = 0
    private var rotation = 0
    private var batchStart = -1
    private var batch: List<Bitmap> = emptyList()
    private var single: Bitmap? = null

    override fun frameAt(sourceMillis: Long): Bitmap? {
        if (failed) return null
        return try {
            open()
            upright(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && frameCount > 0 && durationMillis > 0L) indexed(sourceMillis) else timed(sourceMillis))
        } catch (unreadable: RuntimeException) {
            failed = true
            SceneExportLog.warn("vidéo posée illisible (${file.name} à $sourceMillis ms)", unreadable)
            null
        }
    }

    override fun release() {
        dropBatch()
        single?.recycle()
        single = null
        retriever.release()
    }

    private fun open() {
        if (opened) return
        retriever.setDataSource(file.absolutePath)
        durationMillis = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        frameCount = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)?.toIntOrNull() ?: 0
        } else {
            0
        }
        rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        opened = true
    }

    private fun indexed(sourceMillis: Long): Bitmap? {
        val index = (sourceMillis.toDouble() * frameCount / durationMillis).roundToInt().coerceIn(0, frameCount - 1)
        val offset = index - batchStart
        if (batchStart >= 0 && offset in batch.indices) return batch[offset]
        dropBatch()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null
        batch = retriever.getFramesAtIndex(index, minOf(BATCH, frameCount - index))
        batchStart = index
        return batch.firstOrNull()
    }

    private fun timed(sourceMillis: Long): Bitmap? {
        single?.recycle()
        single = retriever.getFrameAtTime(sourceMillis * MICROS_PER_MILLI, MediaMetadataRetriever.OPTION_CLOSEST)
        return single
    }

    /** Une image restée dans le sens de stockage (largeur et hauteur de la piste) d'une vidéo tournée d'un quart de tour. */
    private fun upright(frame: Bitmap?): Bitmap? {
        if (frame == null || rotation % HALF_TURN == 0) return frame
        val storedWidth = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: return frame
        val storedHeight = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: return frame
        if (storedWidth == storedHeight || frame.width != storedWidth || frame.height != storedHeight) return frame
        val turned = Bitmap.createBitmap(frame, 0, 0, frame.width, frame.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
        replace(frame, turned)
        return turned
    }

    private fun replace(original: Bitmap, turned: Bitmap) {
        val offset = batch.indexOf(original)
        if (offset >= 0) batch = batch.toMutableList().also { it[offset] = turned }
        if (single === original) single = turned
        original.recycle()
    }

    private fun dropBatch() {
        batch.forEach(Bitmap::recycle)
        batch = emptyList()
        batchStart = -1
    }

    private companion object {
        const val BATCH = 6
        const val HALF_TURN = 180
        const val MICROS_PER_MILLI = 1000L
    }
}
