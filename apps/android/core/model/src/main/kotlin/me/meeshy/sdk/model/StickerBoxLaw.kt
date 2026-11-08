package me.meeshy.sdk.model

import kotlin.math.min

/**
 * La boîte de référence d'un sticker de conversation (iOS `BubbleSticker`, `MessageStickerArtwork`) :
 * carré de 200 dp, cartouche 1,5x plus large que haut, emoji dans une boîte de 80 dp à 118 dp de
 * corps. La place est calculée AVANT toute rasterisation, pour que la cellule ne saute pas.
 */
object StickerBoxLaw {
    const val SIDE_DP: Float = 200f
    const val TEMPLATE_RATIO: Float = 1.5f
    const val EMOJI_BOX_DP: Float = 80f
    const val EMOJI_GLYPH_DP: Float = 118f

    data class Size(val width: Float, val height: Float) {
        companion object {
            val ZERO: Size = Size(0f, 0f)
        }
    }

    /**
     * Part du côté laissée VIDE autour d'un film de Mee (#14534) : ses étincelles et ses entrées dépassent la toile
     * de 216 du film, comme sur iOS où rien ne le rogne ; la marge leur fait place sans rétrécir le colibri.
     */
    const val FILM_BLEED_RATIO: Float = 0.1f

    fun filmBleed(side: Float = SIDE_DP): Float = side * FILM_BLEED_RATIO

    /** La place qu'un film occupe dans la rangée : son côté plus la marge de débordement des deux bords. */
    fun filmFootprint(side: Float = SIDE_DP): Float = side + 2 * filmBleed(side)

    /** Le plus grand côté, au plus [preferred], dont l'empreinte (marge comprise) tient dans [width] : un couloir étroit. */
    fun filmSideWithin(width: Float, preferred: Float): Float = min(preferred, width / (1 + 2 * FILM_BLEED_RATIO))

    /**
     * Interligne d'un emoji en grand, en part de son corps (#14534) : l'encre d'un emoji couleur (🥳, 🤯) dépasse
     * l'ascendante et la descendante de sa police ; la ligne lui laisse cette place au lieu de le rogner.
     */
    const val EMOJI_LINE_HEIGHT_RATIO: Float = 1.3f

    fun templateBox(side: Float = SIDE_DP): Size = Size(side * TEMPLATE_RATIO, side)

    /** Réduit [size] pour tenir dans [box], sans jamais agrandir. */
    fun fitted(size: Size, within: Size): Size {
        if (size.width <= 0f || size.height <= 0f) return Size.ZERO
        val ratio = min(1f, min(within.width / size.width, within.height / size.height))
        return Size(size.width * ratio, size.height * ratio)
    }

    /** La boîte de l'oeuvre une fois connue la taille rasterisée ([templateSize]) d'un gabarit. */
    fun artworkBox(source: StickerRenderSource, side: Float = SIDE_DP, templateSize: Size? = null): Size =
        when (source) {
            is StickerRenderSource.Mee, is StickerRenderSource.MeeInstant, is StickerRenderSource.Picture ->
                Size(side, side)
            is StickerRenderSource.Template -> fitted(templateSize ?: templateBox(side), templateBox(side))
            is StickerRenderSource.Emoji -> Size(EMOJI_BOX_DP, EMOJI_BOX_DP)
        }

    /**
     * La place RÉSERVÉE d'un gabarit avant rasterisation : la taille mesurée plus deux marges de
     * découpe, ou le carré par défaut quand elle est inconnue.
     */
    fun reservedTemplateBox(measured: Size?, dieCutMargin: Float, side: Float = SIDE_DP): Size {
        val padded = measured?.let { Size(it.width + 2 * dieCutMargin, it.height + 2 * dieCutMargin) }
            ?: Size(side, side)
        return fitted(padded, templateBox(side))
    }
}
