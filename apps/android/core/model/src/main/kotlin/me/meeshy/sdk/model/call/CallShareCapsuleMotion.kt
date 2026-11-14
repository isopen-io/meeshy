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
    private const val CONTRACTED_SCALE = 0.1f
    private const val CENTER = 0.5f
    private const val TOP = 0f

    /** Durée du fondu quand l'appel se déploie depuis la capsule ([appearing]) ou se contracte vers elle. */
    fun windowFadeMillis(reduceMotion: Boolean, appearing: Boolean): Int = when {
        reduceMotion -> REDUCED_MILLIS
        appearing -> APPEAR_MILLIS
        else -> LEAVE_MILLIS
    }

    /** L'échelle de départ (et d'arrivée) du contenu qui entre ou sort ; 1 = aucune mise à l'échelle. */
    fun startScale(reduceMotion: Boolean): Float = if (reduceMotion) 1f else START_SCALE

    /**
     * #18218 (S1.7, S2.1, P18.4, P18.8) — l'écran d'appel qui se contracte VERS la capsule et se redéploie DEPUIS elle.
     * La capsule est posée en haut de l'application, au centre : l'échelle part de là, comme iOS
     * (`CallView` : `scaleEffect(1 − 0,9 · progrès, anchor: .top)`). Sans capsule ([capsuleLive] faux : premier appel,
     * appel terminé), l'écran garde son échelle courte au centre. « Réduire les animations » : fondu seul.
     */
    fun window(reduceMotion: Boolean, capsuleLive: Boolean): CallWindowMotion = when {
        reduceMotion -> CallWindowMotion(scale = 1f, pivotX = CENTER, pivotY = CENTER)
        capsuleLive -> CallWindowMotion(scale = CONTRACTED_SCALE, pivotX = CENTER, pivotY = TOP)
        else -> CallWindowMotion(scale = START_SCALE, pivotX = CENTER, pivotY = CENTER)
    }
}

/**
 * L'échelle extrême de l'écran d'appel pendant son passage, et le point (fractions de sa largeur et de sa hauteur)
 * vers lequel il se contracte ou depuis lequel il se déploie. [scale] = 1 : aucune mise à l'échelle, fondu seul.
 */
data class CallWindowMotion(val scale: Float, val pivotX: Float, val pivotY: Float)
