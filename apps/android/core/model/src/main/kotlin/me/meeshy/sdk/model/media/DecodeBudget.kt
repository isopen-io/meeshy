package me.meeshy.sdk.model.media

import kotlin.math.max
import kotlin.math.roundToInt

/** Miroir de `DisplayMetrics` (iOS) : l'ecran en dp et sa densite. */
public data class DisplayMetrics(val widthDp: Float, val heightDp: Float, val density: Float)

/**
 * Miroir de `DecodeBudget` (iOS) : la largeur utile d'un decodage, au lieu d'un plafond unique de 1200 px.
 * Plein ecran = largeur physique ; cadre = plus grand cote ; pleine largeur = le plus grand de la largeur ecran et de la hauteur.
 */
public object DecodeBudget {
    public sealed interface Surface {
        public data object Fullscreen : Surface
        public data class Fitting(val widthDp: Float, val heightDp: Float) : Surface
        public data class FullBleed(val heightDp: Float) : Surface
    }

    private const val BUCKET_PX = 64

    public fun maxPixelWidth(surface: Surface, display: DisplayMetrics): Float = when (surface) {
        Surface.Fullscreen -> display.widthDp * display.density
        is Surface.Fitting -> max(surface.widthDp, surface.heightDp) * display.density
        is Surface.FullBleed -> max(display.widthDp, surface.heightDp) * display.density
    }

    public fun targetWidthPx(surface: Surface, display: DisplayMetrics): Int =
        maxPixelWidth(surface, display).roundToInt()

    /** Palier de cache : multiple de 64 px superieur, jamais sous 64, pour que des tailles voisines partagent une cle. */
    public fun bucket(px: Int): Int = if (px <= 0) BUCKET_PX else ((px + BUCKET_PX - 1) / BUCKET_PX) * BUCKET_PX
}
