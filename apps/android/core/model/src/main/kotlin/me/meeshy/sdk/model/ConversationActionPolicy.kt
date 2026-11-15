package me.meeshy.sdk.model

import java.util.Locale
import me.meeshy.sdk.model.call.CallPermission

/**
 * CE QU'UN LECTEUR PEUT FAIRE D'UNE CONVERSATION (#11205, #11209) — miroir exact de
 * `conversationActionsFor` (`packages/shared/utils/conversation-action-policy.ts`, qui fait foi)
 * et de `ConversationActionPolicy.swift`, jumelle PURE de [MessageActionPolicy].
 * `ConversationActionPolicyVectorParityTest` rejoue la grille type × profil des vecteurs partagés.
 *
 * Rang EFFECTIF ([ConversationViewerAuthority.effectiveRank]) : un rôle de plateforme PRIVILÉGIÉ
 * (MODERATOR, ADMIN, BIGBOSS — #11217) MEMBRE ⇒ créateur, jamais au-dessus ; AUDIT, ANALYST y
 * sont des membres ; rang illisible < membre. Fermé en plus : un `direct` n'a pas d'autorité (ses
 * rangs sont un ordre d'arrivée) ; Global ne se renomme, ne se quitte ni ne se supprime pour tous,
 * et seuls les rôles privilégiés y invitent ; une conversation terminée ne se modifie plus ; un
 * type inconnu n'ouvre rien qui en dépende. L'appel suit [CallPermission.canStartCall] ; le badge
 * suit [MessageActionPolicy.Conversation.isEndToEnd].
 *
 * Comme la passerelle (#11215) : le rang de la ligne se lit casse pliée ; Inviter suit
 * `mayMintShareLink`, où tout membre inscrit d'une conversation `public` fabrique un lien ;
 * Quitter exige un compte (`POST /leave`). Masquer et signaler exigent une participation ACTIVE.
 */
object ConversationActionPolicy {

    data class Input(
        val conversation: MessageActionPolicy.Conversation,
        val viewer: ConversationViewerAuthority,
    )

    data class Actions(
        val rename: Boolean,
        val invite: Boolean,
        val leave: Boolean,
        val deleteForAll: Boolean,
        val hide: Boolean,
        val report: Boolean,
        val manageMembers: Boolean,
        val adminOpen: Boolean,
        val call: Boolean,
        val videoCall: Boolean,
        val e2eeBadge: Boolean,
    )

    private val AUTHORITY_TYPES: Set<String> = setOf("group", "public", "broadcast")
    private val MANAGED_TYPES: Set<String> = AUTHORITY_TYPES + MessageActionPolicy.GLOBAL_CONVERSATION_TYPE

    fun actionsFor(input: Input): Actions {
        val conversation = input.conversation
        val viewer = input.viewer
        val rank = viewer.effectiveRank
        val open = !conversation.isClosed
        val authority = conversation.type in AUTHORITY_TYPES
        val moderates = rank >= MemberRole.MODERATOR.level
        val registered = viewer.isRegistered
        val callable = open && viewer.isActiveMember && CallPermission.canStartCall(
            CallPermission.Context(
                conversationType = conversation.type,
                viewerIsCreator = (viewer.conversationRoleRaw ?: "").lowercase(Locale.ROOT) == MemberRole.CREATOR.wireValue,
                viewerConversationRole = viewer.conversationRoleRaw,
                viewerPlatformRole = viewer.platformRoleRaw,
                viewerIsGuest = !registered,
            ),
        )
        val invites = when {
            conversation.isGlobal -> viewer.isActiveMember && viewer.moderatesPlatform
            conversation.type == "public" -> viewer.isActiveMember && registered
            else -> authority && moderates
        }
        return Actions(
            rename = open && authority && moderates,
            invite = open && invites,
            leave = open && authority && viewer.isActiveMember && registered,
            deleteForAll = open && authority && rank >= MemberRole.ADMIN.level,
            hide = registered && viewer.isActiveMember,
            report = registered && viewer.isActiveMember,
            manageMembers = open && conversation.type in MANAGED_TYPES && moderates,
            adminOpen = viewer.administersPlatform,
            call = callable,
            videoCall = callable,
            e2eeBadge = conversation.isEndToEnd,
        )
    }
}

/**
 * La conversation telle que la loi des actions la lit. `dm` se lit `direct` ; la liste ne sert pas
 * `closedAt`, seul `isActive` la dit close.
 */
val ApiConversation.actionPolicyConversation: MessageActionPolicy.Conversation
    get() = MessageActionPolicy.Conversation(
        type = if (isDirect) DIRECT_CONVERSATION_TYPE else type,
        encryptionMode = encryptionMode,
        isActive = isActive,
        closedAt = null,
        isAnnouncementChannel = isAnnouncementChannel,
        defaultWriteRole = defaultWriteRole,
    )
