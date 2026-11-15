package me.meeshy.sdk.model.composer

/**
 * The drag law of the bottom band's handle — port of the iOS grabber. Dragging up grows
 * the panel, down shrinks it, clamped to `[min, max]`; pulling MORE than
 * [DISMISS_SLACK_DP] under the minimum closes the panel and gives the row back.
 */
object ComposerBandResize {
    const val MIN_HEIGHT_DP = 160f
    const val MAX_HEIGHT_DP = 540f
    const val DISMISS_SLACK_DP = 50f

    /** [dragDy] is the vertical finger travel since the drag start, positive = downwards. */
    fun height(
        base: Float,
        dragDy: Float,
        min: Float = MIN_HEIGHT_DP,
        max: Float = MAX_HEIGHT_DP,
    ): Float = (base - dragDy).coerceIn(min, max)

    fun shouldDismiss(
        base: Float,
        dragDy: Float,
        min: Float = MIN_HEIGHT_DP,
    ): Boolean = base - dragDy < min - DISMISS_SLACK_DP
}
