package me.meeshy.app.stories

/**
 * The composer's minimal drawing-tool config: a fixed colour swatch row and three
 * thickness steps (thin / medium / thick, in design-pixels). Not user-extensible —
 * parity with the other composer pickers (text size, outline) that offer a small
 * curated set rather than a full colour wheel.
 */
object StoryDrawingPalette {
    /** Swatches offered by the colour picker, in render order. */
    val colors: List<String> = listOf(
        "FFFFFF",
        "000000",
        "F87171",
        "FBBF24",
        "34D399",
        "60A5FA",
        "818CF8",
        "F472B6",
    )

    /** Thickness steps offered by the width picker (design-pixels), thin to thick. */
    val widths: List<Double> = listOf(6.0, 14.0, 28.0)

    /** The pen's colour when the composer is opened. */
    const val DEFAULT_COLOR: String = "FFFFFF"

    /** The pen's thickness when the composer is opened — the middle step. */
    val DEFAULT_WIDTH: Double = widths[1]
}
