package me.meeshy.sdk.model

/**
 * Le remplissage des bandes d'un média posé en AJUSTER dans un canvas de ratio différent —
 * miroir de `StoryLetterboxFill` (iOS). Pur : mesures en points, aucune vue.
 */
object StoryLetterboxFill {
    /** Les bandes laissées par un média ajusté ; la largeur est celle d'UNE bande. */
    sealed interface Bands {
        data object None : Bands
        data class Horizontal(val height: Double) : Bands
        data class Vertical(val width: Double) : Bands
    }

    /** Une bande plus fine qu'un point n'est pas une bande. */
    const val MINIMUM_BAND_POINTS: Double = 1.0

    /** L'opacité de la teinte qui comble les bandes. */
    const val FILL_OPACITY: Float = 0.85f

    fun bands(mediaWidth: Double, mediaHeight: Double, canvasWidth: Double, canvasHeight: Double): Bands {
        if (mediaWidth <= 0 || mediaHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) return Bands.None
        val ratioMedia = mediaWidth / mediaHeight
        val ratioCanvas = canvasWidth / canvasHeight
        if (ratioMedia > ratioCanvas) {
            val bande = (canvasHeight - canvasWidth / ratioMedia) / 2
            return if (bande >= MINIMUM_BAND_POINTS) Bands.Horizontal(bande) else Bands.None
        }
        if (ratioMedia < ratioCanvas) {
            val bande = (canvasWidth - canvasHeight * ratioMedia) / 2
            return if (bande >= MINIMUM_BAND_POINTS) Bands.Vertical(bande) else Bands.None
        }
        return Bands.None
    }

    /** Les bandes ne se comblent que pour un média EN AJUSTER qui a une source à teinter. */
    fun isServed(fitMode: String?, hasSource: Boolean): Boolean = fitMode == "fit" && hasSource

    sealed interface Source {
        data object StampedBitmap : Source
        data class ThumbHash(val hash: String) : Source
        data object NoSource : Source
    }

    /** La source de la teinte : le bitmap déjà estampillé, sinon la première empreinte non vide. */
    fun source(hasStampedBitmap: Boolean, hashes: List<String>): Source = when {
        hasStampedBitmap -> Source.StampedBitmap
        else -> hashes.firstOrNull { it.isNotEmpty() }?.let { Source.ThumbHash(it) } ?: Source.NoSource
    }

    fun source(thumbHash: String?): Source = source(false, listOfNotNull(thumbHash))
}
