package me.meeshy.ui.component.chrome

/**
 * Pure collapse math shared by every host of [CollapsibleHeader] (Feed, and later
 * Chats) — no [androidx.compose.foundation.lazy.LazyListState] dependency here, so
 * it is unit-testable independently of Compose and re-usable by any host that hands
 * it its own scroll offsets.
 */
object CollapsibleHeaderMotion {

    /**
     * `0f` (fully expanded, at the very top of the list) to `1f` (fully collapsed).
     * Scrolled past the first item is always fully collapsed, regardless of offset —
     * the header never re-expands once the list has moved on to a later item.
     */
    fun collapseProgress(
        firstVisibleItemIndex: Int,
        firstVisibleItemScrollOffsetPx: Int,
        thresholdPx: Int,
    ): Float {
        if (firstVisibleItemIndex > 0) return 1f
        if (thresholdPx <= 0) return if (firstVisibleItemScrollOffsetPx > 0) 1f else 0f
        return (firstVisibleItemScrollOffsetPx.toFloat() / thresholdPx).coerceIn(0f, 1f)
    }

    /** Linear interpolation from [expandedDp] to [collapsedDp] as [progress] runs 0→1. */
    fun heightDp(progress: Float, expandedDp: Float, collapsedDp: Float): Float {
        val p = progress.coerceIn(0f, 1f)
        return expandedDp + (collapsedDp - expandedDp) * p
    }

    /** The bottom divider's alpha, scaling linearly up to a `0.3f` ceiling at full collapse. */
    fun dividerAlpha(progress: Float): Float = progress.coerceIn(0f, 1f) * 0.3f

    /** The title's font size, interpolating from [expandedSp] (28sp) down to [collapsedSp] (17sp). */
    fun titleFontSizeSp(progress: Float, expandedSp: Float = 28f, collapsedSp: Float = 17f): Float {
        val p = progress.coerceIn(0f, 1f)
        return expandedSp + (collapsedSp - expandedSp) * p
    }

    /** Bold below the halfway point of the collapse, semi-bold at or beyond it. */
    fun isTitleBold(progress: Float): Boolean = progress.coerceIn(0f, 1f) < 0.5f
}
