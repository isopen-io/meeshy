package me.meeshy.sdk.model

/**
 * Hauteur d'une vidéo dans une bulle — miroir de `MessageAttachment+VideoSizing.swift`.
 *
 * La bulle doit réserver sa place avant le premier octet de la vidéo : sans ratio
 * connu elle prend du 16:9, et un portrait ne dépasse jamais 1,6 × la largeur
 * (5:8), faute de quoi un reel vertical occuperait tout l'écran du fil.
 */
object VideoSizing {

    /** Plafond height/width d'une vidéo en bulle : `1.6` = portrait 5:8 au plus. */
    const val DEFAULT_MAX_RATIO: Float = 1.6f

    private const val FALLBACK_ASPECT_RATIO: Double = 16.0 / 9.0

    /** Ratio width / height ; `null` tant que les deux dimensions ne sont pas strictement positives. */
    fun aspectRatio(width: Int?, height: Int?): Double? {
        if (width == null || height == null || width <= 0 || height <= 0) return null
        return width.toDouble() / height.toDouble()
    }

    /**
     * Hauteur cible pour la largeur donnée : `min(largeur / ratio, largeur × maxRatio)`,
     * repli 16:9 si le ratio est inconnu. Strictement positive pour une largeur positive.
     */
    fun heightForWidth(
        width: Float,
        aspectRatio: Double?,
        maxRatio: Float = DEFAULT_MAX_RATIO,
    ): Float {
        val ratio = aspectRatio ?: FALLBACK_ASPECT_RATIO
        val natural = (width / ratio).toFloat()
        return minOf(natural, width * maxRatio)
    }
}

/** Ratio width / height de la vidéo ; `null` si les dimensions sont inconnues ou nulles. */
val ApiMessageAttachment.videoAspectRatio: Double?
    get() = VideoSizing.aspectRatio(width, height)

/** Hauteur de la vidéo en bulle pour [forWidth], plafonnée à `maxRatio × largeur`, repli 16:9. */
fun ApiMessageAttachment.videoHeight(
    forWidth: Float,
    maxRatio: Float = VideoSizing.DEFAULT_MAX_RATIO,
): Float = VideoSizing.heightForWidth(forWidth, videoAspectRatio, maxRatio)

/** Ratio width / height de la vidéo ; `null` si les dimensions sont inconnues ou nulles. */
val MeeshyMessageAttachment.videoAspectRatio: Double?
    get() = VideoSizing.aspectRatio(width, height)

/** Hauteur de la vidéo en bulle pour [forWidth], plafonnée à `maxRatio × largeur`, repli 16:9. */
fun MeeshyMessageAttachment.videoHeight(
    forWidth: Float,
    maxRatio: Float = VideoSizing.DEFAULT_MAX_RATIO,
): Float = VideoSizing.heightForWidth(forWidth, videoAspectRatio, maxRatio)
