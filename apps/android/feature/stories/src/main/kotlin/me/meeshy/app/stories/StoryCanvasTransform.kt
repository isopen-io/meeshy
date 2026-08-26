package me.meeshy.app.stories

/**
 * The persisted pan/zoom of one slide's 9:16 canvas content. Unlike the ephemeral
 * fullscreen-viewer transform, this is part of the slide's identity — it survives
 * slide switches and rides into publish — so it lives in the deck, not in transient
 * Compose state. [scale] is clamped to `[MIN_SCALE, MAX_SCALE]`; [offsetX]/[offsetY]
 * are canvas pixels, clamped to the overflow of the scaled content so the user can
 * never pan the content off its own edges.
 *
 * The math is pure and total: a degenerate (not-yet-measured) canvas collapses the
 * pan range to zero rather than dividing by anything, and zooming back out re-clamps
 * an offset that the smaller scale no longer permits. The canvas Composable stays
 * declarative glue — it feeds each `detectTransformGestures` callback straight into
 * [apply] and renders the result.
 */
data class StoryCanvasTransform(
    val scale: Float = MIN_SCALE,
    val offsetX: Float = 0f,
    val offsetY: Float = 0f,
) {
    /** At rest — neither zoomed nor panned, so the canvas needs no `graphicsLayer`. */
    val isIdentity: Boolean get() = scale == MIN_SCALE && offsetX == 0f && offsetY == 0f

    /**
     * Applies one incremental transform gesture: multiply [scale] by the gesture's
     * [zoom] factor (clamped), then translate by the [panX]/[panY] delta (clamped to
     * the bounds implied by the **new** scale and the canvas size), so a pinch-out
     * immediately tightens the pan range and a pinch-in widens it.
     */
    fun apply(
        panX: Float,
        panY: Float,
        zoom: Float,
        canvasWidth: Float,
        canvasHeight: Float,
    ): StoryCanvasTransform {
        val nextScale = clampScale(scale * zoom)
        return copy(
            scale = nextScale,
            offsetX = clampOffset(offsetX + panX, canvasWidth, nextScale),
            offsetY = clampOffset(offsetY + panY, canvasHeight, nextScale),
        )
    }

    /**
     * Re-clamps the current offset to the bounds of the current scale and a freshly
     * measured (or resized) canvas, snapping a now-out-of-range offset back toward the
     * centre. Leaves [scale] untouched.
     */
    fun clampedTo(canvasWidth: Float, canvasHeight: Float): StoryCanvasTransform =
        copy(
            offsetX = clampOffset(offsetX, canvasWidth, scale),
            offsetY = clampOffset(offsetY, canvasHeight, scale),
        )

    /**
     * Projects this pixel-space framing onto the wire's normalised background coordinates —
     * the author-side inverse of [StoryBackgroundObjectTransform.from]. A pixel offset FROM
     * the canvas edge becomes a fraction OF the canvas (`x = 0.5 + offsetX / canvasWidth`),
     * so the value is resolution-independent and reproduces the exact offset the reader
     * converts back on any device.
     *
     * Total on a degenerate input: a not-yet-measured (`<= 0`) or non-finite canvas
     * dimension collapses that axis to the centre rather than dividing by zero, a
     * non-finite offset collapses to centre, and a non-finite/non-positive [scale] decays
     * to the neutral 1× — so a malformed transform can never blank or invert the wire
     * object, only fail to reframe it (mirroring the reader's tolerant decay).
     */
    fun toBackgroundFraming(canvasWidth: Float, canvasHeight: Float): StoryBackgroundFraming =
        StoryBackgroundFraming(
            x = 0.5 + fractionOffset(offsetX, canvasWidth),
            y = 0.5 + fractionOffset(offsetY, canvasHeight),
            scale = scale.toDouble().takeIf { it.isFinite() && it > 0.0 } ?: 1.0,
        )

    companion object {
        /** Content fills the 9:16 canvas exactly — no pan range. */
        const val MIN_SCALE: Float = 1f

        /** Parity with the fullscreen image viewer's pinch ceiling. */
        const val MAX_SCALE: Float = 4f

        /** The at-rest transform every fresh slide starts from. */
        val IDENTITY: StoryCanvasTransform = StoryCanvasTransform()

        fun clampScale(scale: Float): Float = scale.coerceIn(MIN_SCALE, MAX_SCALE)

        /** Half the overflow of the scaled content along one axis — the symmetric pan limit. */
        fun maxOffset(containerSize: Float, scale: Float): Float =
            ((containerSize * scale - containerSize) / 2f).coerceAtLeast(0f)

        fun clampOffset(offset: Float, containerSize: Float, scale: Float): Float {
            val limit = maxOffset(containerSize, scale)
            return offset.coerceIn(-limit, limit)
        }

        /** A pixel [offset] as a signed fraction of [size]; `0.0` on a degenerate size/offset. */
        private fun fractionOffset(offset: Float, size: Float): Double =
            if (size > 0f && offset.isFinite()) offset.toDouble() / size.toDouble() else 0.0
    }
}
