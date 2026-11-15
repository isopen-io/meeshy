package me.meeshy.sdk.model.send

import me.meeshy.sdk.model.QuotedAttachmentSend

/**
 * Ce qu'un message envoyé RELIE à un autre contenu — exclusivement : rien, une réponse (qui peut citer une pièce
 * précise), une réponse à une story, ou un transfert. Miroir de `MessageRelation` (iOS) : les anciens paramètres
 * `replyToId` / `storyReplyToId` / `forwardedFromId` laissaient représenter des combinaisons que le serveur ne comprend
 * pas ; la hiérarchie scellée les rend irreprésentables.
 */
sealed interface MessageRelation {

    data object None : MessageRelation

    data class Reply(val messageId: String, val citing: QuotedAttachmentSend? = null) : MessageRelation

    data class StoryReply(val storyId: String) : MessageRelation

    data class Forward(val messageId: String, val fromConversationId: String? = null) : MessageRelation

    val replyToId: String? get() = (this as? Reply)?.messageId

    val storyReplyToId: String? get() = (this as? StoryReply)?.storyId

    val forwardedFromId: String? get() = (this as? Forward)?.messageId

    val forwardedFromConversationId: String? get() = (this as? Forward)?.fromConversationId

    val attachmentReplyTo: QuotedAttachmentSend? get() = (this as? Reply)?.citing

    companion object {
        /**
         * La relation déduite des anciens paramètres. Préséance en cas de combinaison (qu'aucun appelant ne produit) :
         * story, puis réponse, puis transfert — celle d'iOS. Un identifiant vide vaut absent.
         */
        fun legacy(
            replyToId: String?,
            storyReplyToId: String?,
            forwardedFromId: String?,
            forwardedFromConversationId: String?,
            attachmentReplyToId: String?,
        ): MessageRelation {
            val story = storyReplyToId?.takeIf { it.isNotEmpty() }
            val reply = replyToId?.takeIf { it.isNotEmpty() }
            val forward = forwardedFromId?.takeIf { it.isNotEmpty() }
            return when {
                story != null -> StoryReply(story)
                reply != null -> Reply(reply, QuotedAttachmentSend.anchor(attachmentReplyToId))
                forward != null -> Forward(forward, forwardedFromConversationId?.takeIf { it.isNotEmpty() })
                else -> None
            }
        }
    }
}
