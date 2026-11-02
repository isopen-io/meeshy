package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.StoryMediaCrop

/**
 * Les proportions offertes à une image — UNE liste, dans l'ordre servi : le cadre d'origine,
 * les portraits, puis les paysages. Miroir de `MediaCropRatio` (iOS) et de `MEDIA_CROP_RATIOS`
 * (`packages/shared/utils/media-crop.ts`).
 */
public enum class MediaCropRatio(public val value: Double?, public val notation: String?) {
    FREE(null, null),
    SQUARE(1.0, "1:1"),
    PORTRAIT_4_5(4.0 / 5.0, "4:5"),
    PORTRAIT_3_4(3.0 / 4.0, "3:4"),
    PORTRAIT_9_16(9.0 / 16.0, "9:16"),
    LANDSCAPE_4_3(4.0 / 3.0, "4:3"),
    LANDSCAPE_16_9(16.0 / 9.0, "16:9"),
}

/** Règles pures du recadrage : un rectangle NORMALISÉ 0-1, jamais des pixels. */
public object MediaCropRule {

    /**
     * Le plus grand rectangle du rapport visé qui tient dans la source, centré.
     * [sourceRatio] est largeur/hauteur de la SOURCE ; sans lui, la même forme visée rendrait
     * deux fractions différentes selon l'image.
     */
    public fun centered(ratio: MediaCropRatio, sourceRatio: Double): StoryMediaCrop {
        val target = ratio.value ?: return StoryMediaCrop.FULL
        if (!sourceRatio.isFinite() || sourceRatio <= 0.0) return StoryMediaCrop.FULL
        val w: Double
        val h: Double
        if (target >= sourceRatio) {
            w = 1.0
            h = minOf(1.0, sourceRatio / target)
        } else {
            h = 1.0
            w = minOf(1.0, target / sourceRatio)
        }
        return StoryMediaCrop.clamped(StoryMediaCrop((1.0 - w) / 2.0, (1.0 - h) / 2.0, w, h))
    }
}
