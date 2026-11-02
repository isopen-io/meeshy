package me.meeshy.ui.component

import kotlin.math.max
import kotlin.math.min

/** What a release of the sheet's drag handle resolves to — iOS `EmojiFullPickerSheet.sheetDragGesture`. */
public enum class ReactionSheetDragOutcome { Dismiss, Collapse, Expand, Settle }

/**
 * Pure geometry and gesture law of the six-tab reaction sheet (iOS `EmojiFullPickerSheet`):
 * eight columns, a 340 dp floor, a ceiling of 85 % of the container capped at 620 dp, and a
 * drag that closes, collapses or expands the sheet.
 */
public object EmojiPickerLayout {
    public const val COLUMNS: Int = 8
    public const val MIN_HEIGHT_DP: Float = 340f
    public const val MAX_HEIGHT_CAP_DP: Float = 620f
    public const val MAX_HEIGHT_FRACTION: Float = 0.85f
    public const val MAX_WIDTH_DP: Float = 560f

    private const val DISMISS_DISTANCE_DP = 100f
    private const val DISMISS_VELOCITY_DP = 300f
    private const val EXPAND_DISTANCE_DP = -80f
    private const val EXPAND_VELOCITY_DP = -300f
    private const val EXPANDED_THRESHOLD_DP = 50f

    public fun maxHeight(containerHeightDp: Float): Float =
        min(containerHeightDp * MAX_HEIGHT_FRACTION, MAX_HEIGHT_CAP_DP)

    /** The sheet height while the handle is dragged down by [dragOffsetDp], always within [floor, ceiling]. */
    public fun currentHeight(sheetHeightDp: Float, dragOffsetDp: Float, containerHeightDp: Float): Float =
        min(max(sheetHeightDp - dragOffsetDp, MIN_HEIGHT_DP), maxHeight(containerHeightDp))

    public fun gridRows(emojiCount: Int): Int = (emojiCount + COLUMNS - 1) / COLUMNS

    public fun dragOutcome(
        translationDp: Float,
        predictedEndDp: Float,
        sheetHeightDp: Float,
    ): ReactionSheetDragOutcome = when {
        translationDp > DISMISS_DISTANCE_DP || predictedEndDp > DISMISS_VELOCITY_DP ->
            if (sheetHeightDp > MIN_HEIGHT_DP + EXPANDED_THRESHOLD_DP) {
                ReactionSheetDragOutcome.Collapse
            } else {
                ReactionSheetDragOutcome.Dismiss
            }
        translationDp < EXPAND_DISTANCE_DP || predictedEndDp < EXPAND_VELOCITY_DP ->
            ReactionSheetDragOutcome.Expand
        else -> ReactionSheetDragOutcome.Settle
    }
}
