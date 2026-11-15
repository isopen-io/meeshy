package me.meeshy.sdk.model.composer

import kotlin.math.max

/** Les bornes du champ de saisie : de 1 à 5 lignes (iOS `lineLimit(1...5)`), 44 dp au minimum. */
public object ComposerLineBounds {
    public const val MIN_LINES: Int = 1
    public const val MAX_LINES: Int = 5
    public const val MIN_HEIGHT_DP: Float = 44f

    public fun clamp(lines: Int): Int = lines.coerceIn(MIN_LINES, MAX_LINES)

    public fun heightDp(lines: Int, lineHeightDp: Float, verticalPaddingDp: Float): Float =
        max(MIN_HEIGHT_DP, clamp(lines) * lineHeightDp + verticalPaddingDp)
}
