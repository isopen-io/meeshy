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
    val outputFormat: ImageOutputFormat = ImageOutputFormat.JPEG,
    val passthrough: Boolean = false,
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

    /**
     * Le plan qui garde le FORMAT de la source (miroir de `compressImageData` d'iOS) :
     * un GIF et toute image animée passent tels quels, un PNG déjà sous le plafond aussi,
     * jpeg/png/webp réduits gardent leur type, et HEIC ou format inconnu devient un vrai JPEG.
     * [ImageSource] porte les dimensions déjà orientées (EXIF appliqué).
     */
    fun planFor(
        source: ImageSource,
        context: ImageUploadContext,
        quality: Int = DEFAULT_QUALITY,
    ): ImageCompressionPlan {
        val base = plan(context, source.widthPx, source.heightPx, quality)
        val output = ImageOutputFormat.forSource(source.format)
        val untouched = when (source.format) {
            ImageSourceFormat.GIF -> true
            ImageSourceFormat.WEBP, ImageSourceFormat.PNG ->
                source.animated || !base.resizeRequired
            ImageSourceFormat.JPEG, ImageSourceFormat.HEIC, ImageSourceFormat.UNKNOWN -> false
        }
        return base.copy(outputFormat = output, passthrough = untouched)
    }

    private fun scaledEdge(edgePx: Int, scale: Double): Int =
        floor(edgePx * scale).toInt().coerceAtLeast(1)
}

/** Les formats que le sélecteur peut remettre, lus dans les OCTETS et non dans le nom. */
enum class ImageSourceFormat {
    JPEG, PNG, GIF, WEBP, HEIC, UNKNOWN;

    companion object {
        private const val HEADER = 12
        private const val WEBP_FLAGS_INDEX = 20
        private const val WEBP_ANIMATION_BIT = 0x02

        fun sniff(bytes: ByteArray): ImageSourceFormat {
            if (bytes.size < HEADER) return UNKNOWN
            fun at(vararg expected: Int, offset: Int = 0) =
                expected.indices.all { bytes[offset + it].toInt() and 0xFF == expected[it] }
            return when {
                at(0xFF, 0xD8, 0xFF) -> JPEG
                at(0x89, 0x50, 0x4E, 0x47) -> PNG
                at(0x47, 0x49, 0x46, 0x38) -> GIF
                at(0x52, 0x49, 0x46, 0x46) && at(0x57, 0x45, 0x42, 0x50, offset = 8) -> WEBP
                at(0x66, 0x74, 0x79, 0x70, offset = 4) -> HEIC
                else -> UNKNOWN
            }
        }

        fun isAnimated(bytes: ByteArray, format: ImageSourceFormat): Boolean = when (format) {
            WEBP -> bytes.size > WEBP_FLAGS_INDEX &&
                bytes[WEBP_FLAGS_INDEX].toInt() and WEBP_ANIMATION_BIT != 0
            GIF -> countGraphicControls(bytes) > 1
            else -> false
        }

        private fun countGraphicControls(bytes: ByteArray): Int {
            var count = 0
            for (index in 0..bytes.size - 4) {
                if (bytes[index].toInt() == 0x00 && bytes[index + 1].toInt() == 0x21 &&
                    bytes[index + 2].toInt() and 0xFF == 0xF9 && bytes[index + 3].toInt() == 0x04
                ) {
                    count++
                }
            }
            return count
        }
    }
}

/** Une image décodée en tête : format et dimensions orientées, sans pixels. */
data class ImageSource(
    val format: ImageSourceFormat,
    val widthPx: Int,
    val heightPx: Int,
    val animated: Boolean = false,
)

/** Le type de sortie : extension et MIME restent ceux de la source. */
enum class ImageOutputFormat(val mimeType: String, val fileExtension: String) {
    JPEG("image/jpeg", "jpg"),
    PNG("image/png", "png"),
    GIF("image/gif", "gif"),
    WEBP("image/webp", "webp");

    companion object {
        fun forSource(format: ImageSourceFormat): ImageOutputFormat = when (format) {
            ImageSourceFormat.PNG -> PNG
            ImageSourceFormat.GIF -> GIF
            ImageSourceFormat.WEBP -> WEBP
            ImageSourceFormat.JPEG, ImageSourceFormat.HEIC, ImageSourceFormat.UNKNOWN -> JPEG
        }
    }
}
