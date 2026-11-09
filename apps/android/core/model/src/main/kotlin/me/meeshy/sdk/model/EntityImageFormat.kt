package me.meeshy.sdk.model

import kotlin.math.abs
import kotlin.math.roundToInt
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import me.meeshy.sdk.model.imageedit.NormalizedCrop

/** Une fenêtre en pixels entiers dans une image. */
public data class PixelWindow(val left: Int, val top: Int, val width: Int, val height: Int)

/**
 * **Le format d'une image d'identité** (#17257, miroir de l'iOS `EntityImageFormat`, #17251) : l'avatar est un rond 1:1,
 * la bannière un bandeau 3:1. La retouche de la capture cadre la prise à ce format, et le recadrage final le garantit
 * quoi que la retouche ait rendu.
 */
public enum class EntityImageFormat(public val aspect: Double) {
    AVATAR(1.0),
    BANNER(3.0);

    public val isRound: Boolean get() = this == AVATAR

    /** Le plus grand cadre normalisé aux proportions du format, centré dans la prise ; `null` si elle y est déjà. */
    public fun centeredCrop(sourceWidth: Int, sourceHeight: Int): NormalizedCrop? =
        ComposerCropPreset.centeredCrop(aspect, sourceWidth.toDouble(), sourceHeight.toDouble())

    /** La fenêtre en pixels qui ramène l'image au format, centrée ; `null` si elle y est déjà (à un pixel près) ou vide. */
    public fun pixelWindow(width: Int, height: Int): PixelWindow? {
        if (width <= 0 || height <= 0) return null
        val cropWidth = minOf(width, (height * aspect).roundToInt())
        val cropHeight = minOf(height, (cropWidth / aspect).roundToInt())
        if (abs(width - cropWidth) <= 1 && abs(height - cropHeight) <= 1) return null
        return PixelWindow((width - cropWidth) / 2, (height - cropHeight) / 2, cropWidth, cropHeight)
    }

    public companion object {
        public fun of(target: ImageUploadTarget): EntityImageFormat = when (target) {
            ImageUploadTarget.AVATAR -> AVATAR
            ImageUploadTarget.BANNER -> BANNER
        }
    }
}
