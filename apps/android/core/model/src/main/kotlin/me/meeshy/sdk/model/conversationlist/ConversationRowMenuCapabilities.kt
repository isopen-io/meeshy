package me.meeshy.sdk.model.conversationlist

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationActionPolicy
import me.meeshy.sdk.model.ConversationViewerAuthority
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.actionPolicyConversation
import me.meeshy.sdk.model.declaresMinor
import me.meeshy.sdk.model.isArchiveImposed
import me.meeshy.sdk.model.isDirect

/**
 * CE QUE LE MENU D'UNE RANGÉE PROPOSE (#11215) — miroir de `ConversationRowMenuCapabilities`
 * (`ConversationListView+ListRules.swift`). Les verdicts projettent [ConversationActionPolicy]
 * sur un [ConversationViewerAuthority] construit pour la rangée : le rôle de PLATEFORME servi
 * (`MeeshyUser.role`) et le rôle DANS la conversation (`currentUserRole`). Une liste ne montre
 * que les conversations dont le lecteur est membre : la ligne est active dès qu'il est chargé.
 * Aucun écran ne recompose une liste de rôles : il LIT ces verdicts.
 *
 * Fermé par défaut : un lecteur pas encore chargé n'est membre de rien et n'a pas de compte.
 */
data class ConversationRowMenuCapabilities(
    val rename: Boolean,
    val invite: Boolean,
    val leave: Boolean,
    val report: Boolean,
    val adminOpen: Boolean,
    val removal: Removal?,
    /** « Archiver » / « Désarchiver » : absent quand la passerelle IMPOSE l'archive (Global d'un mineur). */
    val canToggleArchive: Boolean,
    /**
     * « Gérer les membres » (#12865, miroir de #12631) : modérateur ou plus d'un groupe, d'une
     * conversation publique, d'une chaîne ou de Global encore ouverts ; jamais un direct. Le rôle
     * de plateforme privilégié vaut créateur une fois DANS (#11217).
     */
    val manageMembers: Boolean,
    /**
     * « Rendre obsolète » (#14645, #14653) : la porte de `DELETE /conversations/:id/obsolete` —
     * l'administrateur d'un groupe, d'une conversation publique ou d'une chaîne encore ouverts
     * (`deleteForAll`), ou, dans un tête-à-tête ouvert, l'un OU l'autre des deux membres inscrits
     * et actifs (`hide`) ; jamais Global. Quand la passerelle sert `viewerCapabilities.canMakeObsolete`
     * (#14690), c'est elle seule qui décide ; absente, la règle locale reste.
     */
    val obsolete: Boolean = false,
    /**
     * « Appeler » : l'appel du menu compose UN pair, donc jamais un groupe ni soi-même
     * (`CallPermission.canStartCall`, miroir de `ConversationRowMenuCapabilities.call` d'iOS).
     */
    val call: Boolean = false,
    val videoCall: Boolean = false,
    /** « Supprimer pour tous » : la porte de la loi (administrateur et plus d'un type à autorité, ouvert). */
    val deleteForAll: Boolean = false,
) {

    /**
     * L'entrée de la rangée : la loi, et une conversation qui n'est pas sous code. iOS ouvre la
     * fiche derrière la porte du verrou ; Android ne sait pas encore faire passer une autre action
     * que l'ouverture par cette porte, donc il ne propose rien sur une rangée scellée.
     */
    fun offersManageMembers(isLocked: Boolean): Boolean = manageMembers && !isLocked

    /** Ce que l'entrée qui retire DIT, pour un geste qui ne masque que pour soi. */
    enum class Removal {
        /** « Supprimer » — une conversation directe, comme dans toute messagerie. */
        DELETE,

        /**
         * « Masquer la discussion » — tout autre type : elle disparaît de SA liste, les autres la
         * gardent. Le droit `deleteForAll` n'y change rien tant que la liste n'appelle pas la
         * suppression pour tous.
         */
        HIDE,
    }

    companion object {

        fun make(conversation: ApiConversation, currentUser: MeeshyUser?): ConversationRowMenuCapabilities {
            val actions = ConversationActionPolicy.actionsFor(
                ConversationActionPolicy.Input(
                    conversation = conversation.actionPolicyConversation,
                    viewer = viewer(conversation, currentUser),
                ),
            )
            val direct = conversation.isDirect
            val talksToSelf = direct && currentUser != null && conversation.participants.isNotEmpty() &&
                conversation.participants.all { it.userId == currentUser.id }
            val talksToPeer = direct && !talksToSelf && currentUser != null &&
                conversation.participants.any { it.userId != currentUser.id }
            return ConversationRowMenuCapabilities(
                rename = actions.rename,
                invite = actions.invite,
                leave = actions.leave,
                report = actions.report && !talksToSelf,
                adminOpen = actions.adminOpen,
                removal = if (!actions.hide) null else if (direct) Removal.DELETE else Removal.HIDE,
                canToggleArchive = !conversation.isArchiveImposed,
                manageMembers = actions.manageMembers,
                obsolete = conversation.viewerCapabilities?.canMakeObsolete
                    ?: (actions.deleteForAll || (direct && !conversation.actionPolicyConversation.isClosed && actions.hide)),
                deleteForAll = actions.deleteForAll,
                call = actions.call && talksToPeer,
                videoCall = actions.videoCall && talksToPeer,
            )
        }

        /**
         * Les verdicts pour le lecteur d'une conversation OUVERTE : le rôle servi sur la ligne, à défaut celui de sa
         * participation (#15269). Une conversation qui ne le dit pas laisse le lecteur simple membre — fermé par défaut.
         */
        fun forViewer(conversation: ApiConversation, currentUser: MeeshyUser?): ConversationRowMenuCapabilities {
            val participantRole = conversation.participants.firstOrNull { currentUser != null && it.userId == currentUser.id }?.role
            return make(conversation.copy(currentUserRole = conversation.currentUserRole ?: participantRole), currentUser)
        }

        /** Le lecteur tel que la loi le lit, pour une rangée de SA liste. */
        fun viewer(conversation: ApiConversation, currentUser: MeeshyUser?): ConversationViewerAuthority {
            val isAnonymous = currentUser?.isAnonymous == true
            val hasAccount = currentUser != null && !isAnonymous
            return ConversationViewerAuthority(
                id = currentUser?.id ?: "",
                hasAccount = hasAccount,
                isAnonymous = isAnonymous,
                platformRoleRaw = if (hasAccount) currentUser?.role else null,
                conversationRoleRaw = conversation.currentUserRole,
                isActiveMember = currentUser != null,
                canSendMessages = hasAccount,
                isDeclaredMinor = conversation.viewerWriteRestriction.declaresMinor,
            )
        }

        /** La fiche de la conversation dans la console d'administration web. */
        fun adminConsoleUrl(conversationId: String, webOrigin: String): String =
            "${webOrigin.trimEnd('/')}/admin/conversations/$conversationId"
    }
}
