package me.meeshy.sdk.model.conversationoptions

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities
import me.meeshy.sdk.model.isDirect

/**
 * CE QUE LES INFOS D'UNE CONVERSATION PROPOSENT (#13777) — miroir de l'onglet Options iOS
 * (`ConversationPreferencesTab`) et des boutons de `ConversationInfoSheet` (`actionButtons`,
 * `blockUserButton`). Chaque verdict projette la loi déjà servie au menu de la liste
 * ([ConversationRowMenuCapabilities]) : un contrôle que la passerelle refuserait n'est pas montré.
 *
 * - [share] : « Partager » crée un lien d'invitation — la loi `invite`.
 * - [leave] : « Quitter » de l'en-tête — la loi `leave` (un groupe, un compte, une participation).
 * - [leaveGroup] : « Quitter le groupe » des Actions — la même loi, sauf pour son créateur (iOS `canLeave`).
 * - [blockUserId] : « Bloquer cet utilisateur » — un tête-à-tête dont le pair est connu, n'est pas
 *   soi et n'est pas déjà bloqué.
 * - [toggleArchive] : absent quand la passerelle IMPOSE l'archive.
 * - [deleteForMe] : « Supprimer pour moi » — une participation active d'un compte.
 */
data class ConversationOptionsPlan(
    val share: Boolean,
    val leave: Boolean,
    val leaveGroup: Boolean,
    val blockUserId: String?,
    val toggleArchive: Boolean,
    val deleteForMe: Boolean,
) {
    companion object {
        private const val CREATOR_ROLE = "creator"

        fun of(
            conversation: ApiConversation,
            currentUser: MeeshyUser?,
            peerUserId: String?,
            peerBlocked: Boolean,
        ): ConversationOptionsPlan {
            val role = conversation.currentUserRole
                ?: conversation.participants.firstOrNull { it.userId != null && it.userId == currentUser?.id }?.role
            val capabilities = ConversationRowMenuCapabilities.make(conversation.copy(currentUserRole = role), currentUser)
            val isCreator = role?.lowercase() == CREATOR_ROLE
            val blockable = conversation.isDirect && !peerBlocked &&
                !peerUserId.isNullOrBlank() && peerUserId != currentUser?.id
            return ConversationOptionsPlan(
                share = capabilities.invite,
                leave = capabilities.leave,
                leaveGroup = capabilities.leave && !isCreator,
                blockUserId = peerUserId.takeIf { blockable },
                toggleArchive = capabilities.canToggleArchive,
                deleteForMe = capabilities.removal != null,
            )
        }
    }
}
