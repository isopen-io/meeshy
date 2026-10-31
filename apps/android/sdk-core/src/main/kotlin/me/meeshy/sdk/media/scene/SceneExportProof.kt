package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import java.io.File
import kotlin.math.max

/**
 * La preuve qu'une vidéo rendue montre sa scène, avant qu'elle parte à la galerie ou au partage (#13986) : elle lève, avec
 * sa cause, quand le rendu ne tient pas ce que ses sources promettent. Le fichier n'est alors ni enregistré ni partagé.
 */
public fun interface SceneExportProof {
    public suspend fun verify(job: SceneExportJob)

    public companion object {
        /** Aucune relecture : les témoins du coordinateur qui ne portent pas sur le contenu. */
        public val NONE: SceneExportProof = SceneExportProof { }
    }
}

/** Les luminances que la preuve compare : une image sur disque, un calque peint, l'image d'une vidéo à un instant. */
internal interface SceneContentLuma {
    fun image(file: File): Int?
    fun bitmap(bitmap: Bitmap): Int
    fun videoFrame(file: File, atMillis: Long): Int?
}

/** Relit [SceneExportContent.SAMPLES] instants du rendu et les confronte à leurs sources ([SceneExportContent.verdict]). */
internal class RenderedContentProof(private val luma: SceneContentLuma = AndroidSceneContentLuma) : SceneExportProof {

    override suspend fun verify(job: SceneExportJob) {
        val planned = SceneCompositionPlanner.of(job)
        val samples = SceneExportContent.sampleTimes(planned.durationMillis).map { at ->
            val brightest = SceneExportContent.expectedAt(job, planned, at).map { it to measure(it) }.maxByOrNull { it.second }
            SceneContentSample(at, brightest?.second ?: 0, brightest?.first?.label, luma.videoFrame(job.output, at))
        }
        SceneExportContent.verdict(samples)?.let { throw IllegalStateException(it) }
    }

    private fun measure(probe: SceneContentProbe): Int = when (probe) {
        is SceneContentProbe.Picture -> luma.image(probe.file) ?: 0
        is SceneContentProbe.VideoFrame -> luma.videoFrame(probe.file, probe.atMillis) ?: 0
        is SceneContentProbe.Card -> ((luma.image(probe.file) ?: 0) * probe.alpha).toInt()
        is SceneContentProbe.Layer -> when (val overlay = probe.overlay) {
            is SceneExportOverlay.Painted -> luma.bitmap(overlay.bitmap)
            is SceneExportOverlay.Stored -> luma.image(overlay.file) ?: 0
        }
    }
}

/** Les mesures sur l'appareil, à une image réduite (quelques dizaines de pixels de côté) : la même réduction des deux côtés. */
internal object AndroidSceneContentLuma : SceneContentLuma {

    override fun image(file: File): Int? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val options = BitmapFactory.Options().apply { inSampleSize = max(1, max(bounds.outWidth, bounds.outHeight) / SIDE) }
        val decoded = BitmapFactory.decodeFile(file.absolutePath, options) ?: return null
        return try { bitmap(decoded) } finally { decoded.recycle() }
    }

    override fun bitmap(bitmap: Bitmap): Int {
        val readable = if (bitmap.config == Bitmap.Config.HARDWARE) bitmap.copy(Bitmap.Config.ARGB_8888, false) else bitmap
        val scale = SIDE.toFloat() / max(readable.width, readable.height)
        val small = if (scale >= 1f) readable else Bitmap.createScaledBitmap(readable, max(1, (readable.width * scale).toInt()), max(1, (readable.height * scale).toInt()), true)
        return try {
            val pixels = IntArray(small.width * small.height)
            small.getPixels(pixels, 0, small.width, 0, 0, small.width, small.height)
            SceneExportContent.maxLuma(pixels)
        } finally {
            if (small !== readable) small.recycle()
            if (readable !== bitmap) readable.recycle()
        }
    }

    override fun videoFrame(file: File, atMillis: Long): Int? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            val frame = retriever.getFrameAtTime(atMillis * MICROS_PER_MILLI, MediaMetadataRetriever.OPTION_CLOSEST) ?: return null
            try { bitmap(frame) } finally { frame.recycle() }
        } catch (unreadable: RuntimeException) {
            SceneExportLog.warn("image illisible (${file.name} à $atMillis ms)", unreadable)
            null
        } finally {
            retriever.release()
        }
    }

    private const val SIDE = 64
    private const val MICROS_PER_MILLI = 1000L
}
