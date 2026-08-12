package me.meeshy.app.shortcuts

import me.meeshy.app.conversations.ConversationRowTime
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.theme.displayTitle

/**
 * A single dynamic launcher shortcut — kept separate from the
 * `ShortcutManagerCompat`/`ShortcutInfoCompat` platform glue so it is coverable on
 * the JVM (`TDD-COVERAGE.md`).
 */
internal data class DynamicShortcutRow(
    val id: String,
    val shortLabel: String,
)

/**
 * Pure display state for the app's dynamic launcher shortcuts (long-press the
 * launcher icon) — Android's closest local, fully-testable equivalent to iOS's
 * `OpenRecentConversationIntent` App Shortcut. Reuses the same pinned-first-then-
 * recency ordering the home-screen widgets already apply
 * ([ConversationRowTime]) and [ApiConversation.displayTitle] for the label — zero
 * re-implementation.
 */
internal data class DynamicShortcutsPresentation(
    val rows: List<DynamicShortcutRow>,
) {
    companion object {
        fun from(
            conversations: List<ApiConversation>,
            currentUserId: String?,
            maxCount: Int,
        ): DynamicShortcutsPresentation {
            val cap = maxCount.coerceAtLeast(0)
            val rows = conversations
                .sortedWith(
                    compareByDescending<ApiConversation> { it.resolvedPreferences?.isPinned == true }
                        .thenByDescending { ConversationRowTime.epochMillis(it) ?: Long.MIN_VALUE },
                )
                .take(cap)
                .map { conversation ->
                    DynamicShortcutRow(
                        id = conversation.id,
                        shortLabel = conversation.displayTitle(currentUserId),
                    )
                }
            return DynamicShortcutsPresentation(rows)
        }
    }
}
