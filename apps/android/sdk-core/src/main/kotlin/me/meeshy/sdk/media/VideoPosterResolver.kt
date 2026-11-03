package me.meeshy.sdk.media

import android.graphics.Bitmap
import java.io.File
import me.meeshy.sdk.model.media.VideoPosterGrade
import me.meeshy.sdk.model.media.VideoPosterPlan

/** Les faits fichier de la cascade : le fichier vidéo déjà sur l'appareil, ou l'attente de son téléchargement. */
public interface VideoFileSource {
    public fun localFile(videoUrl: String): File?
    public suspend fun awaitFile(videoUrl: String): File?
}

/**
 * Cascade du poster net d'une vidéo (miroir de `VideoPosterResolver`, iOS) : poster persisté de grade
 * plein écran, puis les étapes de [VideoPosterPlan] dans l'ordre. Le résultat est persisté puis rendu.
 */
public class VideoPosterResolver(
    private val files: VideoFileSource,
    private val store: VideoPosterStore,
    private val extractor: RangeFrameExtractor,
    private val decoder: FirstFrameDecoder,
    private val policyAllowsDownload: () -> Boolean,
    private val isOnline: () -> Boolean,
) {
    /** Poster persisté, décodé à taille bornée pour une surface de liste ou de bulle. */
    public fun persistedForList(videoUrl: String): Bitmap? =
        store.read(videoUrl, VideoPosterGrade.LIST_DECODE_MAX_DIMENSION)

    /** Poster persisté de grade plein écran, `null` s'il n'est que de grade bulle. */
    public fun persistedFullscreen(videoUrl: String, sourceMaxDimension: Int?): Bitmap? {
        val poster = store.read(videoUrl, VideoPosterGrade.EXTRACTION_MAX_DIMENSION) ?: return null
        val sharp = VideoPosterGrade.isFullscreenSharp(maxOf(poster.width, poster.height), sourceMaxDimension)
        return poster.takeIf { sharp }
    }

    public suspend fun resolve(
        videoUrl: String,
        sourceMaxDimension: Int?,
        allowsNetwork: Boolean,
        intent: VideoPosterPlan.Intent,
    ): Bitmap? {
        persistedFullscreen(videoUrl, sourceMaxDimension)?.let { return it }
        val steps = VideoPosterPlan.steps(
            localFilePath = files.localFile(videoUrl)?.absolutePath,
            remoteUrl = videoUrl,
            policyAllowsDownload = policyAllowsDownload(),
            allowsNetwork = allowsNetwork && isOnline(),
            intent = intent,
        )
        for (step in steps) {
            val frame = execute(step) ?: continue
            store.write(videoUrl, frame)
            return frame
        }
        return null
    }

    private suspend fun execute(step: VideoPosterPlan.Step): Bitmap? = when (step) {
        is VideoPosterPlan.Step.DecodeLocalFile -> decode(File(step.path))
        is VideoPosterPlan.Step.DownloadThenDecode -> files.awaitFile(step.url)?.let { decode(it) }
        is VideoPosterPlan.Step.RangeExtract ->
            extractor.extract(step.url, VideoPosterGrade.EXTRACTION_MAX_DIMENSION)
    }

    private fun decode(file: File): Bitmap? =
        decoder.decode(file, VideoPosterGrade.EXTRACTION_MAX_DIMENSION)
}
