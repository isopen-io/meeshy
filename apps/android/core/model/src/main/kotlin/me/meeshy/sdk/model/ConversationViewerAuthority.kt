package me.meeshy.sdk.model

import java.util.Locale

/**
 * CE QU'UN LECTEUR EST dans une conversation (#11209) — l'`ActionViewer` de la loi des actions
 * (`packages/shared/utils/message-action-policy.ts`), avec le rang effectif de
 * `conversation-authority` (passerelle). Miroir de `ConversationViewerAuthority.swift`.
 *
 * Les rôles arrivent en CHAÎNES, dans la casse servie, et se lisent comme la loi les lit :
 * - [memberRole] EXACT, en minuscules comme `Participant.role`, pour les gestes sur un MESSAGE
 *   (`admitMessageDelete`, `admitConversationWriteFor`) ; un rang illisible vaut 0 ;
 * - [effectiveRole] casse PLIÉE, pour les gestes sur la CONVERSATION, comme
 *   `effectiveConversationRole` (des lignes `CREATOR` héritées existent) ;
 * - [platformRole] EXACT pour modérer, sans casse pour administrer ([PlatformRole]).
 *
 * Rang EFFECTIF : un rôle de plateforme PRIVILÉGIÉ (MODERATOR, ADMIN, BIGBOSS — #11217) MEMBRE
 * ACTIF vaut le créateur, jamais au-dessus ; AUDIT et ANALYST gardent le rang de leur ligne. Un
 * lecteur qui porte [isAnonymous] est un invité, quel que soit [hasAccount] (fermé par défaut).
 *
 * Aucun défaut hors [participantId] : un défaut sur [isAnonymous], [canSendMessages] ou
 * [isDeclaredMinor] serait OUVERT, donc chaque site le dit.
 */
data class ConversationViewerAuthority(
    /** `User.id` pour un inscrit ; `Participant.id` pour un invité. */
    val id: String,
    val participantId: String? = null,
    val hasAccount: Boolean,
    val isAnonymous: Boolean,
    /** `User.role`, tel que servi. */
    val platformRoleRaw: String?,
    /** `Participant.role` DANS cette conversation, tel que servi. */
    val conversationRoleRaw: String?,
    val isActiveMember: Boolean,
    /** Permission d'envoi de l'invité (`Participant.permissions`) ; vraie pour un inscrit. */
    val canSendMessages: Boolean,
    val isDeclaredMinor: Boolean,
) {
    /** Lecture EXACTE du rôle de plateforme. */
    val platformRole: PlatformRole? get() = PlatformRole.exact(platformRoleRaw)

    /** Lecture EXACTE du rang de la ligne de participation. */
    val memberRole: MemberRole? get() = exactMemberRole(conversationRoleRaw)

    /** Un compte, et pas un invité. */
    val isRegistered: Boolean get() = hasAccount && !isAnonymous

    /** MODERATOR, ADMIN ou BIGBOSS, comparés exactement. */
    val moderatesPlatform: Boolean get() = platformRole?.moderatesContent == true

    /** ADMIN ou BIGBOSS, casse pliée (`isGlobalAdmin`). */
    val administersPlatform: Boolean get() = PlatformRole.caseFolding(platformRoleRaw)?.administers == true

    /** Le niveau de la LIGNE — 0 hors membre actif ou rang illisible. */
    val memberRank: Int get() = if (isActiveMember) memberRole?.level ?: 0 else 0

    /** `effectiveConversationRole` : `null` hors membre actif, rang de la ligne casse pliée. */
    val effectiveRole: MemberRole?
        get() {
            if (!isActiveMember) return null
            if (moderatesPlatform) return MemberRole.CREATOR
            return exactMemberRole(conversationRoleRaw?.lowercase(Locale.ROOT))
        }

    val effectiveRank: Int get() = effectiveRole?.level ?: 0

    companion object {
        /** Le rang dont la valeur filaire est EXACTEMENT [raw], ou `null`. */
        fun exactMemberRole(raw: String?): MemberRole? {
            if (raw == null) return null
            return MemberRole.entries.firstOrNull { it.wireValue == raw }
        }
    }
}
