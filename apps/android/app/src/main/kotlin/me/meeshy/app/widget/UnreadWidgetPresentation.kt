package me.meeshy.app.widget

import me.meeshy.sdk.model.sync.UnreadRules

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
        /** Sans session : jamais le total du compte sortant. */
        fun signedOut(): UnreadWidgetPresentation = UnreadWidgetPresentation(count = 0, hasUnread = false)

        /** La MEME formule que le badge et l'onglet : les autres conversations que l'ouverte, hors sourdines (iOS). */
        fun fromCounts(
            counts: Map<String, Int>,
            open: Set<String>,
            muted: Set<String> = emptySet(),
        ): UnreadWidgetPresentation =
            from(UnreadRules.totalConversationsUnread(counts.filterKeys { it !in muted }, open))

        fun from(totalUnread: Int): UnreadWidgetPresentation {
            val clamped = totalUnread.coerceAtLeast(0)
            return UnreadWidgetPresentation(count = clamped, hasUnread = clamped > 0)
        }
    }
}
