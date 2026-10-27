package me.meeshy.sdk.model.world

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.ParticipantPermissions

/**
 * Ce que `GET /api/v1/world` sert — public, sans identité (miroir de `WorldEntry`, iOS `WorldModels.swift`).
 * La clé de jonction ([shareLinkIdentifier]) se LIT ici ; aucun client ne l'écrit en dur, ce qui permet au
 * serveur de changer de lien sans republier d'application. L'effectif n'est plus servi à un visiteur sans
 * compte (#10205) : absent, il vaut 0 — jamais une entrée perdue parce qu'un agrégat manque.
 */
@Serializable
data class WorldEntry(
    val identifier: String,
    val title: String,
    val shareLinkIdentifier: String,
    val memberCount: Int = 0,
    val memberCountCapped: Boolean? = null,
    val avatar: String? = null,
    val banner: String? = null,
)

/** Le corps de la jonction d'un INVITÉ par la porte canonique des liens : son nom (le pseudo que le fil montrera) et sa langue principale. */
@Serializable
data class LinkMembershipRequest(
    val nickname: String,
    val language: String,
)

/** Les droits RÉSOLUS du participant, servis au seul visiteur sans compte. Fermés par défaut : un droit non nommé n'est pas accordé. */
@Serializable
data class LinkEntryRights(
    val canSendMessages: Boolean? = null,
    val canSendFiles: Boolean? = null,
    val canSendImages: Boolean? = null,
)

@Serializable
data class LinkMembershipEntry(
    val outcome: String? = null,
    val rights: LinkEntryRights? = null,
)

/** Réponse de `POST /links/:key/members` pour un invité. [sessionToken] n'est remis qu'une fois, au seul visiteur sans compte. */
@Serializable
data class LinkMembershipResponse(
    val sessionToken: String? = null,
    val conversationId: String = "",
    val participantId: String = "",
    val entry: LinkMembershipEntry? = null,
) {
    /**
     * La session de l'invité, ou `null` quand la réponse ne peut pas en former une (jeton blanc,
     * conversation ou participant absents) — un échec lisible vaut mieux qu'une session à moitié posée.
     * Les droits sont durcis comme pour toute session invitée ([ParticipantPermissions.anonymous]).
     */
    fun toSessionContext(linkKey: String): AnonymousSessionContext? {
        val token = sessionToken?.takeIf { it.isNotBlank() } ?: return null
        if (conversationId.isBlank() || participantId.isBlank()) return null
        val rights = entry?.rights
        return AnonymousSessionContext(
            sessionToken = token,
            participantId = participantId,
            permissions = ParticipantPermissions.anonymous(
                // iOS : sans bloc de droits, l'invité peut écrire ; avec un bloc, un droit non nommé est refusé.
                canSendMessages = rights?.let { it.canSendMessages ?: false } ?: true,
                canSendFiles = rights?.canSendFiles ?: false,
                canSendImages = rights?.canSendImages ?: false,
            ),
            linkId = linkKey,
            conversationId = conversationId,
        )
    }
}
