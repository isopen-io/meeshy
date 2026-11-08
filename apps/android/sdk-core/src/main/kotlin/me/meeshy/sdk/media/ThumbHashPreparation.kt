package me.meeshy.sdk.media

import java.util.Base64
import me.meeshy.sdk.model.media.ThumbHash

/** L'empreinte ThumbHash d'une miniature décodée : réduite au plan légal puis encodée en base64. */
object ThumbHashPreparation {

    /** [rgba] est un raster [width]x[height] ; `null` si la source est vide ou incohérente. */
    fun encodeBase64(width: Int, height: Int, rgba: ByteArray): String? {
        if (width <= 0 || height <= 0 || rgba.size != width * height * 4) return null
        val plan = ThumbHash.sourcePlan(width, height)
        if (plan.downscaled) return null
        return runCatching { Base64.getEncoder().encodeToString(ThumbHash.encode(width, height, rgba)) }.getOrNull()
    }
}
