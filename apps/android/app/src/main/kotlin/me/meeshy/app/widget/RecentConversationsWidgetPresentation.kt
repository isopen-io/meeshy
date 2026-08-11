package me.meeshy.app.widget

import me.meeshy.app.conversations.ConversationRowTime
import me.meeshy.app.conversations.LastMessagePreviewLabels
import me.meeshy.app.conversations.lastMessagePreview
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle

private val directConversationTypes = setOf("direct", "dm")

/**
 * A single rendered row of [RecentConversationsWidget] — the pure decision behind
 * each Glance list item (title/preview/badges), kept separate from the
 * `@Composable` content so it is coverable on the JVM (`TDD-COVERAGE.md`).
 */
internal data class RecentConversationRow(
    val id: String,
    val title: String,
    val preview: String,
    val isUnread: Boolean,
    val isPinned: Boolean,
    val accentHex: String,
)

/**
 * Pure display state for [RecentConversationsWidget] — parity target: iOS
 * `WidgetDataManager.publishConversations` (ordering: pinned first, then most
 * recently active) + `formatLastMessage` (a sender prefix only on non-direct
 * conversations). Reuses the existing `:sdk-core`/`:feature:conversations` SSOTs
 * ([ApiConversation.displayTitle], [ApiConversation.accentHex], [lastMessagePreview],
 * [ConversationRowTime]) rather than re-implementing any of them.
 */
internal data class RecentConversationsWidgetPresentation(
    val rows: List<RecentConversationRow>,
) {
    val isEmpty: Boolean get() = rows.isEmpty()

    companion object {
        /** iOS keeps up to 50 for the share-sheet's sake but renders `.prefix(5)` in
         * every widget face — Android has no equivalent share-sheet reuse yet, so the
         * widget's own cap is applied directly here. */
        private const val MAX_ROWS = 5

        fun from(
            conversations: List<ApiConversation>,
            currentUserId: String?,
            previewLabels: LastMessagePreviewLabels,
        ): RecentConversationsWidgetPresentation {
            val ordered = conversations.sortedWith(
                compareByDescending<ApiConversation> { it.resolvedPreferences?.isPinned == true }
                    .thenByDescending { ConversationRowTime.epochMillis(it) ?: Long.MIN_VALUE },
            )
            val rows = ordered.take(MAX_ROWS).map { conversation ->
                RecentConversationRow(
                    id = conversation.id,
                    title = conversation.displayTitle(currentUserId),
                    preview = lastMessagePreview(
                        message = conversation.lastMessage,
                        currentUserId = currentUserId,
                        showSender = conversation.type.lowercase() !in directConversationTypes,
                        labels = previewLabels,
                    ),
                    isUnread = conversation.unreadCount > 0,
                    isPinned = conversation.resolvedPreferences?.isPinned == true,
                    accentHex = conversation.accentHex(),
                )
            }
            return RecentConversationsWidgetPresentation(rows)
        }
    }
}
