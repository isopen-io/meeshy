package me.meeshy.sdk.model

import me.meeshy.sdk.model.preview.LastMessageAttachmentSummary

/**
 * Ce que le retrait d'UNE pièce (`attachment:deleted`, #13608) fait aux copies locales : la ligne du message et l'aperçu
 * de la liste. Fonctions pures : chacune rend l'INSTANCE reçue quand l'événement ne change rien (rejeu, pièce déjà
 * retirée par l'auteur), donc l'appelant n'écrit pas deux fois.
 */
object AttachmentRemovalDeltas {

    /**
     * La pièce quitte le message. Plus ni texte ni pièce : la bulle devient une pierre tombale, comme la suppression
     * locale d'un message ([ConversationEventDeltas.deleted]).
     */
    fun message(message: ApiMessage, attachmentId: String, deletedAtIso: String): ApiMessage {
        if (message.attachments.none { it.id == attachmentId }) return message
        val remaining = message.attachments.filterNot { it.id == attachmentId }
        val stripped = message.copy(attachments = remaining)
        val keepsSomething = remaining.isNotEmpty() || message.content.isNotBlank()
        return if (keepsSomething) stripped else ConversationEventDeltas.deleted(stripped, deletedAtIso)
    }

    /**
     * L'aperçu de la ligne de liste quand [messageId] est son dernier message. [previous] est le message qui le précède
     * dans le cache : il reprend la ligne quand celui-ci est vidé.
     */
    fun preview(
        conversation: ApiConversation,
        messageId: String,
        attachmentId: String,
        previous: ApiMessage?,
    ): ApiConversation {
        val last = conversation.lastMessage?.takeIf { it.id == messageId } ?: return conversation
        val pieces = last.attachments ?: return conversation
        if (pieces.none { it.id == attachmentId }) return conversation
        val remaining = pieces.filterNot { it.id == attachmentId }
        val emptied = remaining.isEmpty() && last.content.isNullOrBlank() && last.location == null
        if (emptied && previous != null) return conversation.replacingLast(previous)
        val next = last.copy(
            attachments = remaining,
            count = last.count?.copy(attachments = remaining.size),
            attachmentSummary = last.attachmentSummary?.let { summaryOf(remaining) },
            messageType = if (emptied) "text" else last.messageType,
        )
        return conversation.copy(
            lastMessage = next,
            lastMessageTranslations = if (emptied) null else conversation.lastMessageTranslations,
        )
    }

    private fun ApiConversation.replacingLast(previous: ApiMessage): ApiConversation = copy(
        lastMessage = ApiConversationLastMessage(
            id = previous.id,
            content = previous.content,
            senderId = previous.senderId,
            senderName = previous.sender?.displayName,
            messageType = previous.messageType,
            originalLanguage = previous.originalLanguage,
            createdAt = previous.createdAt,
            isBlurred = previous.isBlurred ?: false,
            isViewOnce = previous.isViewOnce ?: false,
            expiresAt = previous.expiresAt,
            attachments = previous.attachments,
            count = ApiMessageCount(attachments = previous.attachments.size),
            effectFlags = previous.effectFlags,
            ephemeralDuration = previous.ephemeralDuration,
            isForwarded = previous.forwardedFromId != null,
        ),
        lastMessageTranslations = null,
        lastMessageOriginalLanguage = previous.originalLanguage,
    )

    private fun summaryOf(pieces: List<ApiMessageAttachment>): LastMessageAttachmentSummary? =
        pieces.takeIf { it.isNotEmpty() }?.let {
            LastMessageAttachmentSummary(
                count = it.size,
                kinds = it.groupingBy(::kindOf).eachCount(),
                totalSize = it.sumOf { piece -> (piece.fileSize ?: 0).toLong() },
            )
        }

    private fun kindOf(piece: ApiMessageAttachment): String = when (piece.mimeType?.substringBefore('/')) {
        "image" -> "image"
        "video" -> "video"
        "audio" -> "audio"
        else -> "file"
    }
}
