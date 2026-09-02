package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryDrawingStrokePoint

/**
 * Pure mapping between the composer's measured on-screen capture surface (pixels)
 * and the canonical `1080×1920` design space [StoryDrawingStroke][me.meeshy.sdk.model.StoryDrawingStroke]
 * points and width live in — the same referential the reader ([StoryViewerScreen])
 * uses for on-canvas text (`TEXT_DESIGN_CANVAS_WIDTH`). Kept pure and Compose-free
 * so the touch→design conversion the capture Canvas relies on is unit-tested
 * without an Android instrumentation target.
 */
object StoryDrawingCanvasSpace {
    /** Design-space width a story canvas is authored at — iOS `PencilKitCanvas.designSize` parity. */
    const val DESIGN_WIDTH: Float = 1080f

    /** Design-space height a story canvas is authored at — iOS `PencilKitCanvas.designSize` parity. */
    const val DESIGN_HEIGHT: Float = 1920f

    /**
     * Converts one captured screen-pixel offset into a design-space [StoryDrawingStrokePoint],
     * or `null` while the capture surface has not yet been measured (a zero/negative
     * [canvasWidthPx] or [canvasHeightPx] would otherwise divide by zero) — a stroke
     * capture that starts before layout never records a corrupt point.
     */
    fun toDesignPoint(
        offsetXPx: Float,
        offsetYPx: Float,
        canvasWidthPx: Float,
        canvasHeightPx: Float,
        pressure: Double = 1.0,
    ): StoryDrawingStrokePoint? {
        if (canvasWidthPx <= 0f || canvasHeightPx <= 0f) return null
        return StoryDrawingStrokePoint(
            x = (offsetXPx / canvasWidthPx * DESIGN_WIDTH).toDouble(),
            y = (offsetYPx / canvasHeightPx * DESIGN_HEIGHT).toDouble(),
            pressure = pressure,
        )
    }

    /** The screen-pixel X for a design-space [designX], given the measured [canvasWidthPx]. */
    fun toScreenX(designX: Double, canvasWidthPx: Float): Float =
        (designX / DESIGN_WIDTH * canvasWidthPx).toFloat()

    /** The screen-pixel Y for a design-space [designY], given the measured [canvasHeightPx]. */
    fun toScreenY(designY: Double, canvasHeightPx: Float): Float =
        (designY / DESIGN_HEIGHT * canvasHeightPx).toFloat()

    /**
     * The screen-pixel stroke width for a design-space [designWidth]. Scaled by the
     * canvas **width** only (not an average with height) — the same single-axis
     * convention the reader uses for on-canvas text size, so a stroke drawn at a given
     * design width looks the same relative thickness at any canvas size.
     */
    fun toScreenWidth(designWidth: Double, canvasWidthPx: Float): Float =
        (designWidth / DESIGN_WIDTH * canvasWidthPx).toFloat()
}
