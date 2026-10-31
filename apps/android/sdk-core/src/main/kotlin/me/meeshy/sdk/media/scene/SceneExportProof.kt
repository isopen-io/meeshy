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

/**
 * Les mesures que la preuve compare : la luminance d'une image sur disque, d'un calque peint, de l'image d'une vidéo à un
 * instant ; et la couleur moyenne d'une région de chacune (#13897 ; `null` : non mesurée, l'instant n'accuse rien).
 */
internal interface SceneContentLuma {
    fun image(file: File): Int?
    fun bitmap(bitmap: Bitmap): Int
    fun videoFrame(file: File, atMillis: Long): Int?
    fun imageRegion(file: File, region: SceneRegion): SceneColor? = null
    fun bitmapRegion(bitmap: Bitmap, region: SceneRegion): SceneColor? = null
    fun videoRegion(file: File, atMillis: Long, region: SceneRegion): SceneColor? = null
}

/**
 * Relit [SceneExportContent.SAMPLES] instants du rendu et les confronte à leurs sources ([SceneExportContent.verdict]),
 * puis, à ces mêmes instants, le cadre de chaque vidéo posée à l'écran ([PlacedVideoContent.verdict]).
 */
internal class RenderedContentProof(private val luma: SceneContentLuma = AndroidSceneContentLuma) : SceneExportProof {

    override suspend fun verify(job: SceneExportJob) {
        val planned = SceneCompositionPlanner.of(job)
        val times = SceneExportContent.sampleTimes(planned.durationMillis)
        val samples = times.map { at ->
            val brightest = SceneExportContent.expectedAt(job, planned, at).map { it to measure(it) }.maxByOrNull { it.second }
            SceneContentSample(at, brightest?.second ?: 0, brightest?.first?.label, luma.videoFrame(job.output, at))
        }
        SceneExportContent.verdict(samples)?.let { throw IllegalStateException(it) }
        val placed = times.flatMap { at -> job.placedVideos.mapNotNull { placedSample(job, planned, it, at) } }
        PlacedVideoContent.verdict(placed)?.let { throw IllegalStateException(it) }
    }

    /** L'instant [at] dans le cadre de [video] ; `null` quand elle n'est pas à juger (absente, en fondu, illisible). */
    private fun placedSample(job: SceneExportJob, planned: SceneComposition, video: SceneExportPlacedVideo, at: Long): PlacedVideoSample? {
        val source = video.clock.sourceAt(at) ?: return null
        val placement = video.placementAt(at)?.takeIf { it.opacity >= PlacedVideoContent.JUDGED_OPACITY } ?: return null
        val region = PlacedVideoContent.outputRegion(placement, job.format)
        val fill = when (val probe = SceneExportContent.fillAt(planned.video, at)) {
            is SceneContentProbe.Picture -> luma.imageRegion(probe.file, region)
            is SceneContentProbe.VideoFrame -> luma.videoRegion(probe.file, probe.atMillis, region)
            else -> SceneColor.BLACK
        } ?: return null
        val below = job.overlays.filter { it.depth <= video.depth && shows(job, it, at) }
        val under = below.fold(fill) { base, layer -> (regionOf(layer, region) ?: return null).over(base) }
        val above = job.overlays.filter { it.depth > video.depth && shows(job, it, at) }.mapNotNull { regionOf(it, region) }
        val branded = planned.brandLayers.any { it.alphaAt(at) > 0f }
        val frame = luma.videoRegion(video.file, source, PlacedVideoContent.sourceRegion(placement)) ?: return null
        return PlacedVideoSample(
            atMillis = at,
            label = "${video.file.name} (${video.clock.startMillis}–${video.clock.endMillis} ms)",
            expected = frame.under(video.colorMatrix).faded(placement.opacity.coerceIn(0f, 1f)).over(under),
            under = under,
            rendered = luma.videoRegion(job.output, at, region),
            covered = branded || above.any { it.alpha >= PlacedVideoContent.COVERED },
        )
    }

    /** Le calque est-il posé à [at] : à profondeur 0, celui que [TimedBitmapOverlay] sert ; au-dessus, celui qui couvre [at]. */
    private fun shows(job: SceneExportJob, overlay: SceneExportOverlay, at: Long): Boolean {
        if (overlay.depth > 0) return at >= overlay.startMillis && at < overlay.endMillis
        val served = SceneExportContent.layerAt(job.overlays.filter { it.depth == 0 }, at) as? SceneContentProbe.Layer
        return served?.overlay === overlay
    }

    private fun regionOf(overlay: SceneExportOverlay, region: SceneRegion): SceneColor? = when (overlay) {
        is SceneExportOverlay.Painted -> luma.bitmapRegion(overlay.bitmap, region)
        is SceneExportOverlay.Stored -> luma.imageRegion(overlay.file, region)
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

    override fun videoFrame(file: File, atMillis: Long): Int? = frameOf(file, atMillis)?.let { frame ->
        try { bitmap(frame) } finally { frame.recycle() }
    }

    override fun imageRegion(file: File, region: SceneRegion): SceneColor? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val options = BitmapFactory.Options().apply { inSampleSize = max(1, max(bounds.outWidth, bounds.outHeight) / REGION_SIDE) }
        val decoded = BitmapFactory.decodeFile(file.absolutePath, options) ?: return null
        return try { bitmapRegion(decoded, region) } finally { decoded.recycle() }
    }

    override fun bitmapRegion(bitmap: Bitmap, region: SceneRegion): SceneColor? {
        val readable = if (bitmap.config == Bitmap.Config.HARDWARE) bitmap.copy(Bitmap.Config.ARGB_8888, false) else bitmap
        return try {
            val left = (region.left * readable.width).toInt().coerceIn(0, readable.width - 1)
            val top = (region.top * readable.height).toInt().coerceIn(0, readable.height - 1)
            val right = (region.right * readable.width).toInt().coerceIn(left + 1, readable.width)
            val bottom = (region.bottom * readable.height).toInt().coerceIn(top + 1, readable.height)
            val pixels = IntArray((right - left) * (bottom - top))
            readable.getPixels(pixels, 0, right - left, left, top, right - left, bottom - top)
            SceneColor.mean(pixels)
        } finally {
            if (readable !== bitmap) readable.recycle()
        }
    }

    override fun videoRegion(file: File, atMillis: Long, region: SceneRegion): SceneColor? = frameOf(file, atMillis)?.let { frame ->
        val scale = REGION_SIDE.toFloat() / max(frame.width, frame.height)
        val small = if (scale >= 1f) frame else Bitmap.createScaledBitmap(frame, max(1, (frame.width * scale).toInt()), max(1, (frame.height * scale).toInt()), true)
        try { bitmapRegion(small, region) } finally {
            if (small !== frame) small.recycle()
            frame.recycle()
        }
    }

    private fun frameOf(file: File, atMillis: Long): Bitmap? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            retriever.getFrameAtTime(atMillis * MICROS_PER_MILLI, MediaMetadataRetriever.OPTION_CLOSEST)
        } catch (unreadable: RuntimeException) {
            SceneExportLog.warn("image illisible (${file.name} à $atMillis ms)", unreadable)
            null
        } finally {
            retriever.release()
        }
    }

    private const val SIDE = 64
    private const val REGION_SIDE = 256
    private const val MICROS_PER_MILLI = 1000L
}
