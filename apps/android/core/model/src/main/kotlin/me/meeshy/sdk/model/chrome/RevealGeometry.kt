package me.meeshy.sdk.model.chrome

import kotlin.math.hypot

/**
 * La geometrie PURE du devoilement circulaire des Reels — miroir de `ReelsRevealContainer` /
 * `RootView.openReels` / `closeReels` iOS : un disque ne au CENTRE du bouton Flux, qui grandit
 * jusqu'a couvrir l'ecran (0,35 s, ease-out) et se referme en sens inverse (0,3 s, ease-in).
 * « Reduire les animations » : 0,18 s et aucun cercle, un simple fondu.
 */
public object RevealGeometry {
    public const val OPEN_MILLIS: Int = 350
    public const val CLOSE_MILLIS: Int = 300
    public const val REDUCED_MILLIS: Int = 180

    public fun durationMillis(opening: Boolean, reduceMotion: Boolean): Int = when {
        reduceMotion -> REDUCED_MILLIS
        opening -> OPEN_MILLIS
        else -> CLOSE_MILLIS
    }

    /** Le rayon qui atteint le coin le plus eloigne de [centerX], [centerY] dans un cadre [width] x [height]. */
    public fun maxRadius(centerX: Float, centerY: Float, width: Float, height: Float): Float {
        val dx = maxOf(centerX, width - centerX).coerceAtLeast(0f)
        val dy = maxOf(centerY, height - centerY).coerceAtLeast(0f)
        return hypot(dx, dy)
    }

    /** Le rayon du disque a l'avancement [progress] (borne a [0,1]) ; NaN vaut 0. */
    public fun radius(progress: Float, maxRadius: Float): Float = clamp(progress) * maxRadius

    /** Le centre exprime en fraction du cadre ; un cadre non mesure rend le coin haut-gauche (iOS `.topLeading`). */
    public fun unitCenter(x: Float, y: Float, width: Float, height: Float): UnitCenter =
        if (width <= 0f || height <= 0f) UnitCenter(0f, 0f) else UnitCenter((x / width).coerceIn(0f, 1f), (y / height).coerceIn(0f, 1f))

    /** L'opacite du repli sans cercle (reduire les animations). */
    public fun fadeAlpha(progress: Float): Float = clamp(progress)

    /** Le disque a fini de couvrir : le masque peut tomber, la surface video vit. */
    public fun isCovering(progress: Float): Boolean = clamp(progress) >= 1f

    private fun clamp(progress: Float): Float = if (progress.isNaN()) 0f else progress.coerceIn(0f, 1f)
}

public data class UnitCenter(val x: Float, val y: Float)
