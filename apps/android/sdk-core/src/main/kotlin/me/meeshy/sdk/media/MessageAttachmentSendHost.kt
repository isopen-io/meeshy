package me.meeshy.sdk.media

import me.meeshy.sdk.conversation.MessageRepository

/** L'hôte d'un envoi de pièces dans une conversation : la bulle posée au tap part ou échoue par le dépôt de messages. */
public class MessageAttachmentSendHost(private val messages: MessageRepository) : AttachmentSendHost {
    override suspend fun sendPostedBubble(tempId: String, attachmentIds: List<String>, dependsOn: Set<String>): Boolean =
        messages.sendPostedBubble(tempId, attachmentIds, dependsOn)

    override suspend fun markFailed(tempId: String, reason: String) {
        messages.markSendFailed(tempId, reason)
    }
}
