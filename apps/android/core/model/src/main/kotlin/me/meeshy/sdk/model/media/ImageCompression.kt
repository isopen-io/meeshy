package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.ImageUploadTarget
import kotlin.math.floor

/**
 * The upload surface an image is bound for. Each context carries its own longest-edge
 * ceiling in pixels — a chat message tolerates a smaller image than a feed hero, and an
 * avatar is a tiny square thumbnail. Mirrors iOS `MediaContext.maxImageDimension`
 * (message 1200 / story 1080 / feedPost 1600 / avatar 512 / fullscreen 2048) and **adds
 * [BANNER]** (a wide profile hero, absent from iOS's enum) so the shipped avatar/banner
 * upload path has a compression context of its own.
 *
 * Kept a pure enum in `:core:model`: the actual Bitmap decode/scale/JPEG re-encode is an
 * Android-runtime concern that lives app-side, consuming the [ImageCompressionPlan] this
 * ceiling feeds into.
 */
enum class ImageUploadContext(val maxDimensionPx: Int) {
    MESSAGE(maxDimensionPx = 1200),
    STORY(maxDimensionPx = 1080),
    FEED_POST(maxDimensionPx = 1600),
    AVATAR(maxDimensionPx = 512),
    BANNER(maxDimensionPx = 1600),
    FULLSCREEN(maxDimensionPx = 2048);

    companion object {
        /**
         * Bridges the shipped avatar/banner [ImageUploadTarget] onto its compression
         * context — the single source of truth so the two slices never disagree on the
         * per-surface ceiling.
         */
        fun forUploadTarget(target: ImageUploadTarget): ImageUploadContext =
            when (target) {
                ImageUploadTarget.AVATAR -> AVATAR
                ImageUploadTarget.BANNER -> BANNER
            }
    }
}

/**
 * The decided output dimensions + JPEG quality for a single image upload. [resizeRequired]
 * distinguishes the source that already fits its ceiling (re-encode only) from one that
 * must be downscaled first; the app-side encoder always re-encodes to JPEG at [quality].
 */
data class ImageCompressionPlan(
    val targetWidthPx: Int,
    val targetHeightPx: Int,
    val quality: Int,
    val resizeRequired: Boolean,
)

/**
 * Pure, context-aware planner for image compression before upload (feature-parity §P).
 *
 * Given the destination [context] and the decoded source dimensions, it fits the longest
 * edge within the context ceiling — aspect ratio preserved via a single uniform scale,
 * `floor`-rounded exactly like iOS `MediaCompressor.targetSize` — and only marks a resize
 * when the source genuinely exceeds the ceiling (`>`, so an image sitting exactly on the
 * ceiling is left untouched). [quality] is always clamped to the encoder's valid `1..100`
 * band. Takes primitives so the whole decision table stays JVM-testable with no Android
 * runtime; the caller supplies the decoded width/height and performs the pixel work.
 */
object ImageCompressionPlanner {
    const val DEFAULT_QUALITY: Int = 80
    private const val MIN_QUALITY: Int = 1
    private const val MAX_QUALITY: Int = 100

    fun plan(
        context: ImageUploadContext,
        sourceWidthPx: Int,
        sourceHeightPx: Int,
        quality: Int = DEFAULT_QUALITY,
    ): ImageCompressionPlan {
        val clampedQuality = quality.coerceIn(MIN_QUALITY, MAX_QUALITY)

        if (sourceWidthPx <= 0 || sourceHeightPx <= 0) {
            return ImageCompressionPlan(
                targetWidthPx = sourceWidthPx,
                targetHeightPx = sourceHeightPx,
                quality = clampedQuality,
                resizeRequired = false,
            )
        }

        val longestEdge = maxOf(sourceWidthPx, sourceHeightPx)
        if (longestEdge <= context.maxDimensionPx) {
            return ImageCompressionPlan(
                targetWidthPx = sourceWidthPx,
                targetHeightPx = sourceHeightPx,
                quality = clampedQuality,
                resizeRequired = false,
            )
        }

        val scale = context.maxDimensionPx.toDouble() / longestEdge.toDouble()
        return ImageCompressionPlan(
            targetWidthPx = scaledEdge(sourceWidthPx, scale),
            targetHeightPx = scaledEdge(sourceHeightPx, scale),
            quality = clampedQuality,
            resizeRequired = true,
        )
    }

    private fun scaledEdge(edgePx: Int, scale: Double): Int =
        floor(edgePx * scale).toInt().coerceAtLeast(1)
}
