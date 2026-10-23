package me.meeshy.app.stories

/**
 * The one size law of story text, shared by the composer scene and the reader (loi 6 :
 * le player est l'aperçu, #12296). A text's wire `fontSize` is a design unit in the
 * 1080-wide referential, multiplied by its `scale`; on screen it maps onto the REAL width
 * of the scene, exactly as iOS `StoryTextFontResolver` does. A non-positive width yields
 * the 1 px floor, never a zero or negative font.
 */
object StoryTextMetrics {
    const val DESIGN_CANVAS_WIDTH: Float = 1080f

    fun fontPx(fontSize: Double, scale: Double, canvasWidthPx: Float): Float =
        designPx(fontSize, scale, canvasWidthPx).coerceAtLeast(1f)

    /**
     * Any other design-pixel length of a text — its glyph outline (`borderWidth`, iOS
     * `StoryTextLayer`: design px, scaled with the font) — mapped by the same law, with no
     * floor: a zero stays zero (#12324).
     */
    fun designPx(value: Double, scale: Double, canvasWidthPx: Float): Float =
        (value * scale).toFloat().times(canvasWidthPx / DESIGN_CANVAS_WIDTH).coerceAtLeast(0f)
}
