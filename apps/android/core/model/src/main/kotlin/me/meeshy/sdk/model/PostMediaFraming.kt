package me.meeshy.sdk.model

import kotlin.math.roundToInt

/**
 * La hauteur du média d'une carte de post — miroir de `postCardMediaHeight`
 * (`FeedPostCardLayout.swift`). Le média occupe toute la largeur de la carte ; sa
 * hauteur dérive du ratio source `hauteur / largeur`, BORNÉ : sans plafond un clip
 * vertical avale la colonne et le fil cesse d'être parcourable, sans plancher un
 * panorama dégénère en filet.
 */
public object PostMediaFraming {
    /** Plancher du ratio hauteur/largeur (panorama). */
    public const val MIN_RATIO: Double = 0.75

    /** Plafond du ratio hauteur/largeur (portrait). */
    public const val MAX_TALL_RATIO: Double = 1.4

    /**
     * Le ratio hauteur/largeur servi. Dimensions absentes ou nulles : repli sur le
     * plancher, comme iOS.
     */
    public fun heightRatio(
        mediaWidth: Int?,
        mediaHeight: Int?,
        minRatio: Double = MIN_RATIO,
        maxTallRatio: Double = MAX_TALL_RATIO,
    ): Double {
        if (mediaWidth == null || mediaHeight == null || mediaWidth <= 0 || mediaHeight <= 0) return minRatio
        return (mediaHeight.toDouble() / mediaWidth.toDouble()).coerceIn(minRatio, maxTallRatio)
    }

    /** La hauteur en pixels (ou dp) pour une carte de [cardWidth], arrondie à l'entier. */
    public fun fittedMediaHeight(
        mediaWidth: Int?,
        mediaHeight: Int?,
        cardWidth: Float,
        minRatio: Double = MIN_RATIO,
        maxTallRatio: Double = MAX_TALL_RATIO,
    ): Float = (cardWidth * heightRatio(mediaWidth, mediaHeight, minRatio, maxTallRatio)).roundToInt().toFloat()
}
