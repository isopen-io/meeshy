package me.meeshy.ui.component.bubble

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage

public object BubbleContentBuilder {

    public fun build(
        message: ApiMessage,
        currentUserId: String?,
        preferences: LanguageResolver.ContentLanguagePreferences,
        showSenderName: Boolean = false,
        isPending: Boolean = false,
        isFailed: Boolean = false,
    ): BubbleContent {
        val isDeleted = message.deletedAt != null
        val isOutgoing = currentUserId != null && message.senderId == currentUserId
        val isTranslated = !isDeleted && message.isTranslated(preferences)
        val deliveryStatus = when {
            !isOutgoing -> DeliveryStatus.Sent
            isFailed -> DeliveryStatus.Failed
            isPending -> DeliveryStatus.Pending
            message.readByAllAt != null -> DeliveryStatus.Read
            message.readCount > 0 -> DeliveryStatus.Read
            message.deliveredCount > 0 -> DeliveryStatus.Delivered
            else -> DeliveryStatus.Sent
        }
        val reactions = message.reactionSummary
            ?.map { (emoji, count) -> ReactionEntry(emoji = emoji, count = count) }
            ?: emptyList()
        val replyToText = message.replyTo?.let { reply ->
            if (reply.deletedAt != null) "Message deleted" else reply.content
        }
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
            deliveryStatus = deliveryStatus,
            reactions = reactions,
            replyToText = replyToText,
            replyToSenderName = message.replyTo?.senderDisplayName,
            isPending = isPending,
            clientMessageId = message.clientMessageId,
        )
    }
}
