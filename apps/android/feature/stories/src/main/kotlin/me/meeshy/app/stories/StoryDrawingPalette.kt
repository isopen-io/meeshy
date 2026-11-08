package me.meeshy.app.stories

/**
 * The composer's drawing-tool config, iOS `StoryDrawingColors.palette` parity: nine curated swatches and a continuous
 * thickness from [MIN_WIDTH] to [MAX_WIDTH] design-pixels (a 1-step slider).
 */
object StoryDrawingPalette {
    /** Swatches offered by the colour picker, in render order. */
    val colors: List<String> = listOf(
        "FFFFFF",
        "000000",
        "FF2E63",
        "08D9D6",
        "F8B500",
        "9B59B6",
        "2ECC71",
        "FF6B6B",
        "3498DB",
    )

    /** Thinnest brush, in design-pixels. */
    const val MIN_WIDTH: Double = 1.0

    /** Thickest brush, in design-pixels. */
    const val MAX_WIDTH: Double = 30.0

    /** The pen's colour when the composer is opened. */
    const val DEFAULT_COLOR: String = "FFFFFF"

    /** The pen's thickness when the composer is opened. */
    const val DEFAULT_WIDTH: Double = 14.0

    /** Clamps a requested thickness to the supported range. */
    fun clampWidth(width: Double): Double = width.coerceIn(MIN_WIDTH, MAX_WIDTH)
}
