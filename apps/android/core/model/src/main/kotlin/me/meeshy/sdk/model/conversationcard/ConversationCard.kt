package me.meeshy.sdk.model.conversationcard

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * La carte d'une conversation Meeshy désignée par un lien (#8099, #13672) — miroir de
 * `packages/shared/types/api-schemas/conversation-card.ts` et d'iOS `ConversationCard`.
 *
 * Deux portes servent la même forme : `GET /links/:identifier/card` (lien de PARTAGE, identité
 * optionnelle) et `GET /conversations/:id/card` (lien DIRECT, membre seul — un non-membre reçoit le
 * même 404 qu'un identifiant inexistant). Les champs ajoutés après la première version du contrat
 * se décodent avec un défaut : une passerelle plus ancienne les omet, la carte s'affiche quand même.
 * `stats.onlineCount` n'est pas lu : la passerelle le sert toujours `null` (visibilité de la présence).
 */
@Serializable
data class ConversationCard(
    val kind: ConversationCardKind,
    /** `null` pour un non-membre sur lien de partage. */
    val conversationId: String? = null,
    val title: String = "",
    val description: String? = null,
    val avatarUrl: String? = null,
    val bannerUrl: String? = null,
    val conversationType: String = "group",
    val stats: ConversationCardStats = ConversationCardStats(),
    val viewer: ConversationCardViewer = ConversationCardViewer(),
    val link: ConversationCardLink? = null,
    /** Le créateur du lien — jamais son identifiant ni sa présence. */
    val inviter: ConversationCardInviter? = null,
    /** Le message propre au LIEN, distinct de [description] (celle de la conversation). */
    val inviteMessage: String? = null,
) {
    /** Un lien de partage dont le serveur dit qu'il ne sert plus. */
    val isLinkExpired: Boolean get() = link?.isActive == false

    /**
     * L'identité stable la plus proche de la conversation, d'où se dérive son accent : le serveur ne
     * sert ni la langue ni le thème qui composent `accentColor` (iOS `ConversationLinkCardBody.accentHex`).
     */
    val accentSeed: String get() = conversationId ?: link?.identifier ?: title

    /**
     * Ce que la carte porte une fois que le lecteur a (ou non) rejoint : l'état optimiste d'une action
     * se lit comme une vraie carte (iOS `ConversationCard.with(isMember:conversationId:)`).
     */
    fun withMembership(isMember: Boolean, conversationId: String?): ConversationCard {
        val delta = when {
            isMember == viewer.isMember -> 0
            isMember -> 1
            else -> -1
        }
        return copy(
            conversationId = conversationId ?: this.conversationId,
            stats = stats.copy(memberCount = (stats.memberCount + delta).coerceAtLeast(0)),
            viewer = viewer.copy(
                isMember = isMember,
                canJoin = kind == ConversationCardKind.SHARE_LINK && !isMember && !isLinkExpired,
                canJoinAnonymously = if (isMember) false else viewer.canJoinAnonymously,
            ),
        )
    }
}

@Serializable
enum class ConversationCardKind {
    @SerialName("share-link")
    SHARE_LINK,

    @SerialName("direct")
    DIRECT,
}

@Serializable
data class ConversationCardStats(
    val memberCount: Int = 0,
    /** `null` sauf membre ou lien qui autorise l'historique. */
    val messageCount: Int? = null,
    val languages: List<String> = emptyList(),
)

@Serializable
data class ConversationCardViewer(
    val isMember: Boolean = false,
    val canJoin: Boolean = false,
    val requiresAccount: Boolean = false,
    val canJoinAnonymously: Boolean = false,
)

@Serializable
data class ConversationCardLink(
    val identifier: String,
    val isActive: Boolean,
    val expiresAt: String? = null,
)

@Serializable
data class ConversationCardInviter(
    val displayName: String,
    val username: String? = null,
    val avatarUrl: String? = null,
)
