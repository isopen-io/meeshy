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
