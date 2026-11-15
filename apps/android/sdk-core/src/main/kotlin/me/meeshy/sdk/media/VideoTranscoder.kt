package me.meeshy.sdk.media

import java.io.File
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.media.ImageUploadContext
import me.meeshy.sdk.model.media.VideoBudget
import me.meeshy.sdk.model.media.VideoSourceInfo
import me.meeshy.sdk.model.media.VideoTargetCodec
import me.meeshy.sdk.model.media.VideoTranscodePlan
import me.meeshy.sdk.model.media.VideoTranscodePlanner

/** Lit codec, dimensions tournées, débit et cadence d'une vidéo ; `null` = illisible. */
public interface VideoSourceProbe {
    public fun probe(file: File): VideoSourceInfo?
}

/** Dit si l'appareil décode le HEVC en matériel — la condition du ré-encodage HEVC. */
public interface VideoCodecCapabilities {
    public fun hasHardwareHevc(): Boolean
}

public data class VideoTransformRequest(
    val input: File,
    val output: File,
    val plan: VideoTranscodePlan,
    val dropFrames: Boolean,
)

/**
 * Le moteur d'écriture (Media3 Transformer en production). Lève en cas d'échec ; sur
 * annulation de la coroutine il arrête l'export. Il ne nettoie pas : c'est [VideoTranscoder].
 */
public interface VideoTransformRunner {
    public suspend fun run(request: VideoTransformRequest, onProgress: (Float) -> Unit)
}

public enum class VideoCompressionMode { REMUXED, REENCODED_HEVC, REENCODED_H264 }

public enum class VideoCompressionFailure { UNREADABLE_SOURCE, TRANSFORM_FAILED }

public sealed interface VideoCompressionOutcome {
    public val file: File

    public data class Compressed(override val file: File, val mode: VideoCompressionMode) : VideoCompressionOutcome

    /** L'envoi continue avec l'original ; [failure] dit pourquoi (état explicite). */
    public data class Original(override val file: File, val failure: VideoCompressionFailure) : VideoCompressionOutcome
}

/**
 * Allège une vidéo avant l'envoi — miroir de `MediaCompressor.compressVideo`. Remux si la
 * source tient déjà dans le budget du contexte, sinon ré-encodage HEVC (décodeur matériel)
 * ou H.264. La chaîne de repli : remux raté -> ré-encodage ; HEVC raté -> H.264 ; tout raté
 * -> l'original. L'annulation supprime le fichier temporaire et se propage.
 */
public class VideoTranscoder(
    private val probe: VideoSourceProbe,
    private val capabilities: VideoCodecCapabilities,
    private val runner: VideoTransformRunner,
    private val workDirectory: File,
    private val ioDispatcher: CoroutineDispatcher,
) {

    public suspend fun compress(
        source: File,
        context: ImageUploadContext,
        onProgress: (Float) -> Unit = {},
    ): VideoCompressionOutcome {
        val info = withContext(ioDispatcher) { probe.probe(source) }
            ?: return VideoCompressionOutcome.Original(source, VideoCompressionFailure.UNREADABLE_SOURCE)
        val budget = VideoBudget.forContext(context)
        val hevc = capabilities.hasHardwareHevc()
        val preferred = VideoTranscodePlanner.plan(info, budget, hevc)
        val dropFrames = { plan: VideoTranscodePlan ->
            plan is VideoTranscodePlan.Transcode && (info.frameRate ?: 0f) > plan.frameRate
        }
        for (plan in candidates(preferred, info, budget, hevc)) {
            val output = tempFile()
            val done = attempt(source, output, plan, dropFrames(plan), onProgress)
            if (done) return VideoCompressionOutcome.Compressed(output, modeOf(plan))
        }
        return VideoCompressionOutcome.Original(source, VideoCompressionFailure.TRANSFORM_FAILED)
    }

    private fun candidates(
        preferred: VideoTranscodePlan,
        info: VideoSourceInfo,
        budget: VideoBudget,
        hevc: Boolean,
    ): List<VideoTranscodePlan> {
        val reencode = when (preferred) {
            is VideoTranscodePlan.Transcode -> preferred
            VideoTranscodePlan.Passthrough -> VideoTranscodePlanner.transcode(info, budget, hevc)
        }
        val h264 = reencode.copy(codec = VideoTargetCodec.H264)
        return buildList {
            if (preferred is VideoTranscodePlan.Passthrough) add(preferred)
            add(reencode)
            if (reencode.codec == VideoTargetCodec.HEVC) add(h264)
        }
    }

    private suspend fun attempt(
        source: File,
        output: File,
        plan: VideoTranscodePlan,
        dropFrames: Boolean,
        onProgress: (Float) -> Unit,
    ): Boolean = try {
        runner.run(VideoTransformRequest(source, output, plan, dropFrames), onProgress)
        withContext(ioDispatcher) { Mp4FastStart.apply(output) }
        output.exists() && output.length() > 0
    } catch (cancelled: CancellationException) {
        output.delete()
        throw cancelled
    } catch (failure: Throwable) {
        output.delete()
        false
    }

    private fun tempFile(): File {
        workDirectory.mkdirs()
        return File(workDirectory, "compressed_${UUID.randomUUID()}.mp4")
    }

    private fun modeOf(plan: VideoTranscodePlan): VideoCompressionMode = when (plan) {
        VideoTranscodePlan.Passthrough -> VideoCompressionMode.REMUXED
        is VideoTranscodePlan.Transcode ->
            if (plan.codec == VideoTargetCodec.HEVC) VideoCompressionMode.REENCODED_HEVC
            else VideoCompressionMode.REENCODED_H264
    }
}
