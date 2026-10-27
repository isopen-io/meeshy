package me.meeshy.sdk.share

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.model.isDirect
import me.meeshy.sdk.model.mayCurrentUserWrite
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.ShareSheetState
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle

/**
 * **L'annuaire des destinataires de l'écran de partage** (#13469) — miroir de
 * `ShareRecipientDirectory` (iOS), côté pur : la source (cache puis réseau) passe ses
 * conversations, l'annuaire décide LESQUELLES sont des destinataires.
 *
 * - la conversation d'où le contenu vient n'est jamais proposée ;
 * - une conversation où l'on ne peut pas écrire ([mayCurrentUserWrite]) non plus — ce qui exclut
 *   déjà toute conversation chiffrée de bout en bout, qu'Android ne sait pas encore sceller :
 *   aucun clair ne part vers elle (fail-closed, #13015) ;
 * - une conversation directe avec une personne bloquée est exclue.
 *
 * L'ordre reçu est conservé (la liste arrive déjà triée par activité).
 */
object ShareRecipientDirectory {

    fun fromConversations(
        conversations: List<ApiConversation>,
        sourceConversationId: String?,
        currentUserId: String?,
        blockedUserIds: Set<String> = emptySet(),
    ): List<ShareRecipient> = conversations.asSequence()
        .filter { it.id != sourceConversationId }
        .filter { it.mayCurrentUserWrite(currentUserId) }
        .mapNotNull { conversation ->
            val peer = conversation.interlocutor(currentUserId)?.userId
            if (peer != null && peer in blockedUserIds) return@mapNotNull null
            ShareRecipient.conversation(
                conversationId = conversation.id,
                title = conversation.displayTitle(currentUserId),
                detail = if (conversation.isDirect) ShareRecipient.Detail.Direct else ShareRecipient.Detail.Group(conversation.memberCount),
                avatarUrl = conversation.avatar?.takeIf { it.isNotBlank() },
                accentHex = conversation.accentHex(),
                peerUserId = peer,
            )
        }
        .toList()

    /** Les destinataires proposés d'emblée, avant toute frappe : les plus récents. */
    fun recents(recipients: List<ShareRecipient>): List<ShareRecipient> = recipients.take(ShareSheetState.RECENTS_COUNT)
}
