package me.meeshy.app.widget

/**
 * Pure display state for [UnreadCountWidget] — derives "all caught up" vs. "N
 * unread" from a raw total (mirrors iOS `MeeshyWidgets.SmallUnreadView`'s own
 * `count > 0` branch). Kept separate from the `@Composable` Glance content so it
 * is coverable on the JVM (`TDD-COVERAGE.md` exempts `@Composable` glue, not the
 * decision behind it).
 */
internal data class UnreadWidgetPresentation(
    val count: Int,
    val hasUnread: Boolean,
) {
    companion object {
        fun from(totalUnread: Int): UnreadWidgetPresentation {
            val clamped = totalUnread.coerceAtLeast(0)
            return UnreadWidgetPresentation(count = clamped, hasUnread = clamped > 0)
        }
    }
}
