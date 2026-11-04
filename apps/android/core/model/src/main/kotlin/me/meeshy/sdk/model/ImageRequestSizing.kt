package me.meeshy.sdk.model

import kotlin.math.ceil

/**
 * Conversion dp -> pixels de la cible passée à [ImageVariantPicker] : arrondie au pixel
 * SUPÉRIEUR pour que la variante élue couvre toujours la case (jamais d'image étirée).
 */
object ImageRequestSizing {
    fun widthPx(dp: Float, density: Float): Int =
        if (dp <= 0f || density <= 0f) 0 else ceil(dp * density).toInt()
}
