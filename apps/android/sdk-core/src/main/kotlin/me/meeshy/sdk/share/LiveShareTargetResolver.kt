package me.meeshy.sdk.share

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.model.mayCurrentUserWrite
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.sdk.model.share.ShareRecipient

/**
 * La conversation d'une ligne : celle qu'elle nomme, ou la directe de la personne — retrouvée ou créée À L'ENVOI
 * (idempotent côté passerelle), jamais à la sélection. Une personne bloquée ne reçoit rien ; hors ligne, la création
 * n'est pas tentée et la ligne dit qu'elle ne peut pas être jointe. Le MODE de la conversation rendue n'est pas jugé
 * ici : [ShareDispatcher] le relit avant qu'une bulle ne naisse (fail-closed).
 */
@Singleton
class LiveShareTargetResolver @Inject constructor(
    private val conversations: ConversationRepository,
    private val blocks: BlockCache,
) : ShareTargetResolver {

    override suspend fun resolve(recipient: ShareRecipient, sender: MeeshyUser): ShareTarget {
        if (isBlocked(recipient.userId)) return ShareTarget.Refused(ShareFailure.GENERIC)
        recipient.conversationId?.let { return ShareTarget.Ready(it) }
        val userId = recipient.userId ?: return ShareTarget.Refused(ShareFailure.GENERIC)
        return when (val resolution = conversations.directConversationWith(userId)) {
            is DirectConversationResolution.Found -> gate(resolution.conversation, sender)
            is DirectConversationResolution.Created -> gate(resolution.conversation, sender)
            is DirectConversationResolution.Queued -> ShareTarget.Refused(ShareFailure.UNREACHABLE)
            is DirectConversationResolution.Failed ->
                ShareTarget.Refused(if (resolution.offline) ShareFailure.UNREACHABLE else ShareFailure.GENERIC)
        }
    }

    private fun gate(conversation: ApiConversation, sender: MeeshyUser): ShareTarget = when {
        !conversation.mayCurrentUserWrite(sender.id) -> ShareTarget.Refused(ShareFailure.SEALED_DESTINATION)
        isBlocked(conversation.interlocutor(sender.id)?.userId) -> ShareTarget.Refused(ShareFailure.GENERIC)
        else -> ShareTarget.Ready(conversation.id)
    }

    private fun isBlocked(userId: String?): Boolean = userId != null && blocks.isBlocked(userId)
}
