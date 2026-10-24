package me.meeshy.app.conversations

import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiConversationLastMessage

/**
 * No in-app language preference configured — the strict Prisme descent has no rank
 * to walk, so the original content is shown (no `"fr"` fallback: that one serves
 * COMPOSITION defaults only). Used only when [previewLines] is called before a
 * session has hydrated (mirrors the same-shaped fallback each feature module
 * already keeps locally, e.g. chat's/feed's own `EmptyContentPreferences`).
 */
private object NoLanguagePreferences : LanguageResolver.ContentLanguagePreferences {
    override val systemLanguage: String? = null
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}

/**
 * Formats already-sliced [recent] messages (oldest first) into one preview line
 * each, for the hard-press preview card. Reuses [messageSummaryLine] verbatim —
 * same media-type labels, same sender-prefix rule, same protection kinds — so the
 * card's lines and the row's own last-message line can never drift: an expired,
 * blurred or view-once message reads as its kind label, never as its text (parity
 * iOS `ConversationListPreviewLoader.sealedForPreview`). Applies the Prisme Linguistique
 * per message ([me.meeshy.sdk.model.ApiMessage.displayContent]): the viewer's
 * preferred translation when one matches, the original content otherwise —
 * never `translations.first()`.
 */
fun previewLines(
    recent: List<LocalMessage>,
    currentUserId: String?,
    showSender: Boolean,
    prefs: LanguageResolver.ContentLanguagePreferences?,
    labels: LastMessagePreviewLabels,
    nowMillis: Long = System.currentTimeMillis(),
): List<String> {
    val resolved = prefs ?: NoLanguagePreferences
    return recent.map { local ->
        val message = local.message
        messageSummaryLine(
            message = ApiConversationLastMessage(
                id = message.id,
                content = message.displayContent(resolved),
                senderId = message.senderId,
                senderName = message.sender?.displayName,
                messageType = message.messageType,
                originalLanguage = message.originalLanguage,
                createdAt = message.createdAt,
                isBlurred = message.isBlurred == true,
                isViewOnce = message.isViewOnce == true,
                expiresAt = message.expiresAt,
            ),
            currentUserId = currentUserId,
            showSender = showSender,
            labels = labels,
            nowMillis = nowMillis,
        ).text
    }
}
