package me.meeshy.sdk.model.call

/** A row of the control block: the family it titles, or `null` when families fold into one line. */
data class CallPillRowContent(val family: CallActionFamily?, val actions: List<CallAction>) {
    val id: String get() = family?.name ?: "folded"
}

/** In compact height the captioned rows fold into ONE untitled scrolling line. */
object CallGroupStageSizing {
    const val COMPACT_HEIGHT_THRESHOLD_DP: Float = 500f
    const val MINIMUM_GRID_HEIGHT_DP: Float = 140f

    /** The unfolded rows scroll past this height. */
    const val MAXIMUM_ROWS_HEIGHT_DP: Float = 340f

    /** The rows never give up their last line, so the grid yields only down to this point. */
    const val MINIMUM_ROWS_HEIGHT_DP: Float = 96f

    /**
     * How tall the unfolded rows may be so that the grid keeps [MINIMUM_GRID_HEIGHT_DP] (iOS `.frame(minHeight:)`):
     * what the stage holds besides the rows and the grid is [reservedDp]. The rows scroll within this height.
     */
    fun rowsCeilingDp(stageHeightDp: Float, reservedDp: Float): Float =
        (stageHeightDp - reservedDp - MINIMUM_GRID_HEIGHT_DP).coerceIn(MINIMUM_ROWS_HEIGHT_DP, MAXIMUM_ROWS_HEIGHT_DP)

    fun isCompactHeight(stageHeightDp: Float): Boolean =
        stageHeightDp > 0f && stageHeightDp < COMPACT_HEIGHT_THRESHOLD_DP

    fun rows(families: List<CallActionFamilyRow>, isCompactHeight: Boolean): List<CallPillRowContent> {
        if (!isCompactHeight) return families.map { CallPillRowContent(it.family, it.actions) }
        val actions = families.flatMap { it.actions }
        return if (actions.isEmpty()) emptyList() else listOf(CallPillRowContent(null, actions))
    }
}
