package me.meeshy.app.widget

import me.meeshy.app.conversations.ConversationRowTime
import me.meeshy.app.conversations.LastMessagePreviewLabels
import me.meeshy.app.widget.kit.WidgetOutsidePreview
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.theme.displayTitle

/**
 * Pure display state for [QuickReplyWidget] — parity target: iOS
 * `QuickReplyWidgetView` (`entry.conversations.first(where: isUnread) ??
 * entry.conversations.first`). Reuses the SAME pinned-first-then-recency ordering
 * ([ConversationRowTime]) the sibling widgets already apply to the same
 * `ConversationProvider`-equivalent source, then features the first unread
 * conversation in that order, falling back to the first conversation overall.
 * `null` when there is nothing to feature (empty cache).
 */
internal data class QuickReplyWidgetPresentation(
    val conversationId: String,
    val title: String,
    val preview: String,
) {
    companion object {
        fun from(
            conversations: List<ApiConversation>,
            currentUserId: String?,
            previewLabels: LastMessagePreviewLabels,
            preferredLanguages: List<String> = emptyList(),
            ephemeralLabel: String = "",
            nowMillis: Long = System.currentTimeMillis(),
        ): QuickReplyWidgetPresentation? {
            val ordered = conversations.sortedWith(
                compareByDescending<ApiConversation> { it.resolvedPreferences?.isPinned == true }
                    .thenByDescending { ConversationRowTime.epochMillis(it) ?: Long.MIN_VALUE },
            )
            val featured = ordered.firstOrNull { it.unreadCount > 0 } ?: ordered.firstOrNull() ?: return null
            return QuickReplyWidgetPresentation(
                conversationId = featured.id,
                title = featured.displayTitle(currentUserId),
                preview = WidgetOutsidePreview.text(
                    conversation = featured,
                    currentUserId = currentUserId,
                    showSender = featured.type.lowercase() !in directConversationTypes,
                    labels = previewLabels,
                    ephemeralLabel = ephemeralLabel,
                    preferredLanguages = preferredLanguages,
                    nowMillis = nowMillis,
                ),
            )
        }
    }
}
