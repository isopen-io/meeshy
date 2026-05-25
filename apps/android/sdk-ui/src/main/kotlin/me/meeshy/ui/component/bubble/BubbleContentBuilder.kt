package me.meeshy.ui.component.bubble

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage

/**
 * Pure builder of [BubbleContent] (ARCHITECTURE.md §11).
 *
 * Applies the Prisme Linguistique (CLAUDE.md): the displayed text is the
 * preferred translation, or the original content when no translation targets a
 * preferred language — never an arbitrary translation.
 */
public object BubbleContentBuilder {

    public fun build(
        message: ApiMessage,
        currentUserId: String?,
        preferences: LanguageResolver.ContentLanguagePreferences,
        showSenderName: Boolean = false,
    ): BubbleContent {
        val isDeleted = message.deletedAt != null
        val isOutgoing = currentUserId != null && message.senderId == currentUserId
        val isTranslated = !isDeleted && message.isTranslated(preferences)
        return BubbleContent(
            messageId = message.id,
            text = if (isDeleted) "" else message.displayContent(preferences),
            isOutgoing = isOutgoing,
            isTranslated = isTranslated,
            originalText = if (isTranslated) message.content else null,
            senderName = (message.sender?.displayName ?: message.sender?.username)
                ?.takeIf { it.isNotBlank() },
            showSenderName = showSenderName && !isOutgoing,
            isEdited = message.isEdited,
            isDeleted = isDeleted,
            createdAtIso = message.createdAt,
        )
    }
}
