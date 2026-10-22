package me.meeshy.sdk.model.call

/** A row of the control block: the family it titles, or `null` when families fold into one line. */
data class CallPillRowContent(val family: CallActionFamily?, val actions: List<CallAction>) {
    val id: String get() = family?.name ?: "folded"
}

/** In compact height the captioned rows fold into ONE untitled scrolling line. */
object CallGroupStageSizing {
    const val COMPACT_HEIGHT_THRESHOLD_DP: Float = 500f
    const val MINIMUM_GRID_HEIGHT_DP: Float = 140f

    fun isCompactHeight(stageHeightDp: Float): Boolean =
        stageHeightDp > 0f && stageHeightDp < COMPACT_HEIGHT_THRESHOLD_DP

    fun rows(families: List<CallActionFamilyRow>, isCompactHeight: Boolean): List<CallPillRowContent> {
        if (!isCompactHeight) return families.map { CallPillRowContent(it.family, it.actions) }
        val actions = families.flatMap { it.actions }
        return if (actions.isEmpty()) emptyList() else listOf(CallPillRowContent(null, actions))
    }
}
