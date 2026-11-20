package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Une demande d'entrée EN ATTENTE, telle que `GET /communities/:id/join-requests` la sert aux intendants
 * (#19878, miroir de `decodeCommunityJoinRequest` du web, `apps/web/src/lib/api/community-join-requests.ts`).
 *
 * Une demande lue est une PROJECTION : nom, avatar, pays (code ISO à deux lettres, jamais la ville) et date.
 * La passerelle ne sert ni la présence ni les coordonnées du demandeur ; ce qu'elle servirait en trop n'est
 * pas déclaré ici, donc pas gardé.
 */
@Serializable
data class ApiCommunityJoinRequest(
    val id: String,
    val userId: String,
    val status: String? = null,
    val country: String? = null,
    val createdAt: String = "",
    val user: Requester = Requester(),
) {
    @Serializable
    data class Requester(
        val username: String = "",
        val displayName: String? = null,
        val avatar: String? = null,
    )

    val name: String get() = user.displayName?.takeIf { it.isNotBlank() } ?: user.username

    val avatar: String? get() = user.avatar?.takeIf { it.isNotBlank() }

    val countryCode: String? get() = country?.takeIf { COUNTRY.matches(it) }

    /** Une ligne sans identifiant, ou qui n'est plus en attente, ne s'affiche pas. */
    val isReadable: Boolean get() = id.isNotEmpty() && userId.isNotEmpty() && (status == null || status == PENDING)
}

private const val PENDING = "pending"
private val COUNTRY = Regex("^[A-Z]{2}$")

/** La décision d'un intendant sur une demande : `POST …/join-requests/:requestId/accept` ou `…/reject`. */
enum class CommunityJoinRequestDecision { ACCEPT, REJECT }

/** La réponse d'un refus : la demande et son nouvel état. Personne n'entre. */
@Serializable
data class CommunityJoinRequestRejected(val id: String? = null, val status: String? = null)

/**
 * `community:join-requested` (#19429) — miroir de `CommunityJoinRequestedEventData`. Posé sur la room
 * personnelle des administrateurs, des modérateurs et du créateur seulement ; la charge ne nomme le
 * demandeur que par son identifiant : la liste se RELIT, et la relecture repasse par les gardes de la
 * passerelle (blocage, compte fermé).
 */
@Serializable
data class CommunityJoinRequestedEvent(
    val communityId: String,
    val requestId: String? = null,
    val userId: String? = null,
    val pendingCount: Int? = null,
    val at: String? = null,
)
