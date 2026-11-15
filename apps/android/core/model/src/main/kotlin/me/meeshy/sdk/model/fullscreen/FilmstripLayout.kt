package me.meeshy.sdk.model.fullscreen

import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Les cotes de la pellicule de la galerie (miroir de `FilmstripMetrics`) : tête de lecture à DROITE, la marge de tête
 * vaut `largeur − vignette − queue`, de sorte que la première vignette arrive sous la tête et la dernière aussi.
 */
public object FilmstripLayout {
    public const val ITEM_SIDE_DP: Float = 54f
    public const val SPACING_DP: Float = 6f
    public const val VERTICAL_PADDING_DP: Float = 10f
    public const val BOTTOM_PADDING_DP: Float = 6f
    public const val TRAILING_INSET_DP: Float = 12f

    /** La hauteur que la pellicule réserve : le couloir bas du cadrage. */
    public const val RESERVED_HEIGHT_DP: Float = ITEM_SIDE_DP + VERTICAL_PADDING_DP * 2 + BOTTOM_PADDING_DP
    public const val STRIDE_DP: Float = ITEM_SIDE_DP + SPACING_DP

    public fun leadingInset(containerWidth: Float): Float = max(0f, containerWidth - ITEM_SIDE_DP - TRAILING_INSET_DP)

    public fun contentWidth(count: Int): Float = if (count > 0) count * ITEM_SIDE_DP + (count - 1) * SPACING_DP else 0f

    public fun scrollOffset(index: Int): Float = max(0, index) * STRIDE_DP

    public fun indexAtPlayhead(scrollOffset: Float, count: Int): Int =
        if (count <= 0) 0 else (scrollOffset / STRIDE_DP).roundToInt().coerceIn(0, count - 1)

    public fun maxScrollOffset(count: Int, containerWidth: Float): Float =
        max(0f, leadingInset(containerWidth) + contentWidth(count) + TRAILING_INSET_DP - containerWidth)
}
