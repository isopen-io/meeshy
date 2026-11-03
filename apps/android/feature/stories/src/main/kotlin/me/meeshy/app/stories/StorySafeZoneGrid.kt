package me.meeshy.app.stories

/**
 * The pixel geometry of the composer's composition overlay: the viewer-chrome
 * **safe rectangle** ([safeLeft]/[safeTop]/[safeRight]/[safeBottom]) plus the classic
 * **magnetic lines** ([verticalLines] = x positions, [horizontalLines] = y
 * positions: the object snap targets of [StorySnapResolver]). All values are absolute pixels within the measured canvas. When the canvas
 * has no usable size the geometry is [isEmpty] (zeroed rect, empty line lists) so the
 * canvas draws nothing rather than a degenerate hairline.
 */
data class SafeZoneGeometry(
    val safeLeft: Float,
    val safeTop: Float,
    val safeRight: Float,
    val safeBottom: Float,
    val verticalLines: List<Float>,
    val horizontalLines: List<Float>,
) {
    /** True when the safe rect has no positive area — nothing to draw. */
    val isEmpty: Boolean get() = safeRight <= safeLeft || safeBottom <= safeTop
}

/**
 * Pure, Compose-agnostic geometry for the story composer's alignment overlay —
 * the single source of truth for "where does the safe rectangle sit and where do the
 * rule-of-thirds lines fall". Ported from iOS `StorySafeZone`: the insets are asymmetric
 * because the viewer's chrome (progress bars + header + Dynamic Island up top; reply bar +
 * gradient scrim + actions at the bottom) eats unequal margins, so a centred safe zone
 * would lie. The canvas Composable converts nothing here — it just strokes the returned
 * rect and lines — so all the framing math is unit-tested in one place. No Android, no I/O.
 *
 * There is NO permanent rule-of-thirds grid any more (directive #15148): the lines are the snap
 * targets themselves, and the canvas paints them only while a gesture is in progress.
 */
object StorySafeZoneGrid {

    /** Top inset — viewer progress bars + header + Dynamic Island (~18% of canvas height). */
    const val TOP_INSET: Float = 0.18f

    /** Bottom inset — viewer reply bar + gradient scrim + actions (~25% of canvas height). */
    const val BOTTOM_INSET: Float = 0.25f

    /** Left/right inset — a slim margin off each vertical edge. */
    const val HORIZONTAL_INSET: Float = 0.05f

    /** The magnetic lines on each axis: exactly the object snap targets (0.18 / 0.25 / 0.5 / 0.75 / 0.82). */
    val MAGNETIC_LINES: List<Float> = StorySnapResolver.OBJECT_TARGETS

    private val EMPTY = SafeZoneGeometry(
        safeLeft = 0f,
        safeTop = 0f,
        safeRight = 0f,
        safeBottom = 0f,
        verticalLines = emptyList(),
        horizontalLines = emptyList(),
    )

    /**
     * Denormalises the safe rect and the rule-of-thirds lines onto a [width]×[height] pixel
     * canvas. A non-finite or non-positive dimension collapses to the [EMPTY] geometry so a
     * canvas that has not measured yet (or measured to zero) draws nothing.
     */
    fun geometry(width: Float, height: Float): SafeZoneGeometry {
        if (!width.isFinite() || !height.isFinite() || width <= 0f || height <= 0f) return EMPTY
        return SafeZoneGeometry(
            safeLeft = HORIZONTAL_INSET * width,
            safeTop = TOP_INSET * height,
            safeRight = (1f - HORIZONTAL_INSET) * width,
            safeBottom = (1f - BOTTOM_INSET) * height,
            verticalLines = MAGNETIC_LINES.map { it * width },
            horizontalLines = MAGNETIC_LINES.map { it * height },
        )
    }
}
