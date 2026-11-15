package me.meeshy.sdk.model.media

import kotlin.math.min

public enum class VideoSourceCodec { H264, HEVC, OTHER }

public enum class VideoTargetCodec { H264, HEVC }

/** Ce que la sonde lit d'une vidéo source : dimensions déjà tournées, comme l'écran les montre. */
public data class VideoSourceInfo(
    val codec: VideoSourceCodec,
    val displayWidth: Int,
    val displayHeight: Int,
    val bitRate: Long?,
    val frameRate: Float?,
)

/**
 * Le budget d'une vidéo par contexte d'envoi — miroir de `MediaContext` iOS
 * (`videoBitRate`, `maxVideoResolution`, `audioBitRate`). Le bandeau de profil,
 * absent d'iOS, prend le budget du fil.
 */
public data class VideoBudget(
    val videoBitRate: Int,
    val maxWidth: Int,
    val maxHeight: Int,
    val audioBitRate: Int,
) {
    public companion object {
        private const val AUDIO_STANDARD = 96_000
        private const val AUDIO_RICH = 128_000

        public fun forContext(context: ImageUploadContext): VideoBudget = when (context) {
            ImageUploadContext.MESSAGE -> VideoBudget(2_500_000, 720, 1280, AUDIO_STANDARD)
            ImageUploadContext.STORY -> VideoBudget(4_000_000, 1080, 1920, AUDIO_RICH)
            ImageUploadContext.FEED_POST, ImageUploadContext.BANNER ->
                VideoBudget(4_000_000, 1080, 1920, AUDIO_STANDARD)
            ImageUploadContext.AVATAR -> VideoBudget(1_000_000, 480, 480, AUDIO_STANDARD)
            ImageUploadContext.FULLSCREEN -> VideoBudget(8_000_000, 1920, 1080, AUDIO_RICH)
        }
    }
}

public sealed interface VideoTranscodePlan {

    /** Déjà au format cible : on recopie les échantillons, sans décodage. */
    public data object Passthrough : VideoTranscodePlan

    public data class Transcode(
        val codec: VideoTargetCodec,
        val width: Int,
        val height: Int,
        val videoBitRate: Int,
        val frameRate: Int,
        val audioBitRate: Int,
    ) : VideoTranscodePlan
}

/**
 * Décision pure du chemin vidéo, miroir de `MediaCompressor.compressVideo` : remux si
 * H.264/HEVC, résolution dans le budget (à un pixel près) et débit ≤ 2× le budget ;
 * sinon ré-encodage, HEVC avec un décodeur matériel, H.264 sans.
 */
public object VideoTranscodePlanner {
    private const val BITRATE_TOLERANCE = 2L
    private const val RESOLUTION_TOLERANCE_PX = 1
    private const val MAX_FRAME_RATE = 30

    public fun plan(source: VideoSourceInfo, budget: VideoBudget, hardwareHevc: Boolean): VideoTranscodePlan =
        if (canRemux(source, budget)) {
            VideoTranscodePlan.Passthrough
        } else {
            transcode(source, budget, hardwareHevc)
        }

    private fun canRemux(source: VideoSourceInfo, budget: VideoBudget): Boolean {
        val modern = source.codec == VideoSourceCodec.H264 || source.codec == VideoSourceCodec.HEVC
        val fits = source.displayWidth <= budget.maxWidth + RESOLUTION_TOLERANCE_PX &&
            source.displayHeight <= budget.maxHeight + RESOLUTION_TOLERANCE_PX
        val light = (source.bitRate ?: 0L) <= budget.videoBitRate * BITRATE_TOLERANCE
        return modern && fits && light
    }

    public fun transcode(source: VideoSourceInfo, budget: VideoBudget, hardwareHevc: Boolean): VideoTranscodePlan.Transcode {
        val (width, height) = fit(source.displayWidth, source.displayHeight, budget)
        return VideoTranscodePlan.Transcode(
            codec = if (hardwareHevc) VideoTargetCodec.HEVC else VideoTargetCodec.H264,
            width = width,
            height = height,
            videoBitRate = budget.videoBitRate,
            frameRate = source.frameRate?.let { min(it.toInt(), MAX_FRAME_RATE) }?.coerceAtLeast(1) ?: MAX_FRAME_RATE,
            audioBitRate = budget.audioBitRate,
        )
    }

    private fun fit(width: Int, height: Int, budget: VideoBudget): Pair<Int, Int> {
        if (width <= budget.maxWidth && height <= budget.maxHeight) return even(width.toDouble()) to even(height.toDouble())
        val scale = min(budget.maxWidth.toDouble() / width, budget.maxHeight.toDouble() / height)
        return even(width * scale) to even(height * scale)
    }

    private fun even(value: Double): Int {
        val whole = value.toInt()
        return (if (whole % 2 == 0) whole else whole - 1).coerceAtLeast(2)
    }
}
