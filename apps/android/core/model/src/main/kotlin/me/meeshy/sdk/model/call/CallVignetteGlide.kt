package me.meeshy.sdk.model.call

import kotlin.math.abs

/**
 * #19701 — l'appel réduit flotte en UNE vignette, en audio comme en vidéo (iOS `CallBubbleView`, web `call-bubble.tsx`).
 * Le doigt la porte image par image ; au lâcher, elle poursuit sa course selon l'élan, puis se pose au bord le plus
 * proche, dans la zone permise. Mêmes valeurs qu'iOS (`CallBubbleGestureResolver.glidedTranslation`) et le web
 * (`glideBubble`). Positions en pixels, coin haut-gauche de la vignette.
 */
object CallVignetteGlide {
    /** La vitesse du lâcher (px/s) se projette sur cette durée. */
    const val PROJECTION_SECONDS = 0.18f

    /** Le plus long chemin que l'élan ajoute, par axe, en dp (à convertir). */
    const val MAX_GLIDE_DP = 320f

    /** Glisser la capsule de cette distance (dp) la replie en vignette — iOS `collapseDistanceThreshold`. */
    const val COLLAPSE_DISTANCE_DP = 80f

    /** Le ressort qui pose la vignette, amorti pour ne pas rebondir (iOS `glideDamping`). */
    const val DAMPING = 0.82f

    /** Les bornes du coin haut-gauche de la vignette dans l'écran. */
    data class Bounds(val minX: Float, val maxX: Float, val minY: Float, val maxY: Float)

    data class Landing(val x: Float, val y: Float)

    /** Le déplacement que l'élan ajoute au geste, borné à [maxGlide]. */
    fun glide(position: Float, velocity: Float, maxGlide: Float): Float =
        position + (velocity * PROJECTION_SECONDS).coerceIn(-maxGlide, maxGlide)

    /** Où la vignette se pose : le point que l'élan projette, aimanté au bord le plus proche, borné en hauteur. */
    fun landing(x: Float, y: Float, velocityX: Float, velocityY: Float, bounds: Bounds, maxGlide: Float): Landing {
        val glidedX = glide(x, velocityX, maxGlide)
        val glidedY = glide(y, velocityY, maxGlide)
        val edgeX = if (glidedX < (bounds.minX + bounds.maxX) / 2) bounds.minX else bounds.maxX
        return Landing(edgeX, glidedY.coerceIn(bounds.minY, maxOf(bounds.minY, bounds.maxY)))
    }

    /** La capsule glissée assez loin, d'un côté ou de l'autre, se replie en vignette. */
    fun collapses(travelledDp: Float): Boolean = abs(travelledDp) >= COLLAPSE_DISTANCE_DP
}
