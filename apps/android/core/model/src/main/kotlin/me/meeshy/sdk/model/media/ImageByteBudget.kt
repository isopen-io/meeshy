package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.ImageUploadTarget

/**
 * Le budget d'octets d'une photo d'entité (avatar, bannière) : au-delà, le téléversement
 * s'allonge sans rien gagner à l'écran. Miroir de `maxSizeKB` d'iOS (`entityImagePickerFlow`).
 * Le plafond de dimension vient du [context] — UNE source, `ImageUploadContext`.
 */
public enum class ImageByteBudget(public val maxBytes: Long, public val context: ImageUploadContext) {
    AVATAR(maxBytes = 500L * 1024, context = ImageUploadContext.AVATAR),
    BANNER(maxBytes = 800L * 1024, context = ImageUploadContext.BANNER);

    public fun admits(sizeBytes: Long): Boolean = sizeBytes <= maxBytes

    public companion object {
        public fun forTarget(target: ImageUploadTarget): ImageByteBudget = when (target) {
            ImageUploadTarget.AVATAR -> AVATAR
            ImageUploadTarget.BANNER -> BANNER
        }
    }
}

/** Une passe de l'échelle : une qualité JPEG et le facteur appliqué aux dimensions déjà plafonnées. */
public data class ImageBudgetStep(val quality: Int, val dimensionFactor: Double)

/**
 * L'échelle de passes, de la moins destructive à la plus : la qualité descend d'abord jusqu'au
 * plancher, puis la dimension rétrécit à qualité plancher. Huit passes au plus — la boucle
 * s'arrête à la première qui passe sous le budget, ou rend la dernière.
 */
public object ImageByteBudgetLadder {
    public const val START_QUALITY: Int = 85
    public const val FLOOR_QUALITY: Int = 45
    public const val MAX_PASSES: Int = 8

    public val steps: List<ImageBudgetStep> = listOf(
        ImageBudgetStep(START_QUALITY, 1.0),
        ImageBudgetStep(75, 1.0),
        ImageBudgetStep(65, 1.0),
        ImageBudgetStep(55, 1.0),
        ImageBudgetStep(FLOOR_QUALITY, 1.0),
        ImageBudgetStep(FLOOR_QUALITY, 0.8),
        ImageBudgetStep(FLOOR_QUALITY, 0.64),
        ImageBudgetStep(FLOOR_QUALITY, 0.5),
    )

    public fun scaled(edgePx: Int, factor: Double): Int =
        kotlin.math.floor(edgePx * factor).toInt().coerceAtLeast(1)
}

/** Le pas d'échantillonnage du décodage : jamais plus de 12 mégapixels en mémoire, jamais sous la cible. */
public object ImageDecodeSampling {
    public const val MAX_DECODE_PIXELS: Long = 12_000_000L

    public fun sampleSize(widthPx: Int, heightPx: Int, targetLongestPx: Int): Int {
        if (widthPx <= 0 || heightPx <= 0) return 1
        val longest = maxOf(widthPx, heightPx)
        var sample = 1
        while (longest / (sample * 2) >= targetLongestPx) sample *= 2
        while ((widthPx.toLong() / sample) * (heightPx.toLong() / sample) > MAX_DECODE_PIXELS) sample *= 2
        return sample
    }
}
