package me.meeshy.sdk.model.call

/**
 * #17767 — le mouvement de la capsule de partage d'écran (loi 17 : rien n'apparaît ni ne disparaît d'un coup). Pendant
 * d'iOS `CallShareCapsuleMotion` : transformation et opacité seulement ; « Réduire les animations » remplace toute
 * mise à l'échelle par un fondu court.
 */
object CallShareCapsuleMotion {
    private const val APPEAR_MILLIS = 220
    private const val LEAVE_MILLIS = 180
    private const val REDUCED_MILLIS = 120
    private const val START_SCALE = 0.92f

    /** Durée du fondu quand l'appel se déploie depuis la capsule ([appearing]) ou se contracte vers elle. */
    fun windowFadeMillis(reduceMotion: Boolean, appearing: Boolean): Int = when {
        reduceMotion -> REDUCED_MILLIS
        appearing -> APPEAR_MILLIS
        else -> LEAVE_MILLIS
    }

    /** L'échelle de départ (et d'arrivée) du contenu qui entre ou sort ; 1 = aucune mise à l'échelle. */
    fun startScale(reduceMotion: Boolean): Float = if (reduceMotion) 1f else START_SCALE
}
