package me.meeshy.app.stories

/**
 * Les mesures d'un sticker, partagées par le compositeur et le lecteur (loi 6, #14298) : son côté est
 * [BASE_DESIGN_SIDE] pixels de la scène de référence 1080, projetés sur la largeur réelle de la scène, puis son échelle
 * s'y applique ; l'emoji en occupe [GLYPH_FRACTION], le corps de texte d'un gabarit [TEMPLATE_BODY_FRACTION].
 */
internal object StickerArtMetrics {
    const val BASE_DESIGN_SIDE: Double = StoryStickerElement.BASE_DESIGN_SIDE
    const val GLYPH_FRACTION: Float = 0.8f
    const val TEMPLATE_BODY_FRACTION: Float = 0.16f
    private const val DESIGN_CANVAS_WIDTH: Float = 1080f

    /** Le côté d'un sticker à l'échelle 1 sur une scène de [canvasWidthPx] pixels de large. */
    fun sidePx(canvasWidthPx: Float): Float = canvasWidthPx * BASE_DESIGN_SIDE.toFloat() / DESIGN_CANVAS_WIDTH
}
