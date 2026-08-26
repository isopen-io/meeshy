package me.meeshy.app.stories

/**
 * The pixel geometry of the composer's persistent composition overlay: the viewer-chrome
 * **safe rectangle** ([safeLeft]/[safeTop]/[safeRight]/[safeBottom]) plus the classic
 * **rule-of-thirds** grid lines ([verticalThirds] = x positions, [horizontalThirds] = y
 * positions). All values are absolute pixels within the measured canvas. When the canvas
 * has no usable size the geometry is [isEmpty] (zeroed rect, empty line lists) so the
 * canvas draws nothing rather than a degenerate hairline.
 */
data class SafeZoneGeometry(
    val safeLeft: Float,
    val safeTop: Float,
    val safeRight: Float,
    val safeBottom: Float,
    val verticalThirds: List<Float>,
    val horizontalThirds: List<Float>,
) {
    /** True when the safe rect has no positive area — nothing to draw. */
    val isEmpty: Boolean get() = safeRight <= safeLeft || safeBottom <= safeTop
}

/**
 * Pure, Compose-agnostic geometry for the story composer's persistent alignment overlay —
 * the single source of truth for "where does the safe rectangle sit and where do the
 * rule-of-thirds lines fall". Ported from iOS `StorySafeZone`: the insets are asymmetric
 * because the viewer's chrome (progress bars + header + Dynamic Island up top; reply bar +
 * gradient scrim + actions at the bottom) eats unequal margins, so a centred safe zone
 * would lie. The canvas Composable converts nothing here — it just strokes the returned
 * rect and lines — so all the framing math is unit-tested in one place. No Android, no I/O.
 *
 * The grid deliberately carries only the two thirds lines per axis (not the centre line):
 * the centre is already surfaced transiently by [StorySnapResolver]'s magnetic snap guide,
 * so the persistent overlay stays the classic 3×3 rule-of-thirds and never double-draws it.
 */
object StorySafeZoneGrid {

    /** Top inset — viewer progress bars + header + Dynamic Island (~18% of canvas height). */
    const val TOP_INSET: Float = 0.18f

    /** Bottom inset — viewer reply bar + gradient scrim + actions (~25% of canvas height). */
    const val BOTTOM_INSET: Float = 0.25f

    /** Left/right inset — a slim margin off each vertical edge. */
    const val HORIZONTAL_INSET: Float = 0.05f

    /** Rule-of-thirds fractions on each axis; the centre (0.5) is intentionally absent. */
    val THIRDS: List<Float> = listOf(1f / 3f, 2f / 3f)

    private val EMPTY = SafeZoneGeometry(
        safeLeft = 0f,
        safeTop = 0f,
        safeRight = 0f,
        safeBottom = 0f,
        verticalThirds = emptyList(),
        horizontalThirds = emptyList(),
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
            verticalThirds = THIRDS.map { it * width },
            horizontalThirds = THIRDS.map { it * height },
        )
    }
}
