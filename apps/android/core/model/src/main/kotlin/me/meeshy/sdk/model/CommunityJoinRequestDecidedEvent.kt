package me.meeshy.sdk.model

import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.Serializable

/**
 * `community:join-request-decided` (#19879, consommé ici pour #19949) — miroir de
 * `CommunityJoinRequestDecidedEventData` (`packages/shared/types/socketio-events/community.ts`).
 * Posé sur la seule room du DEMANDEUR quand un intendant refuse sa demande ; la charge ne dit ni qui
 * a tranché, ni la demande d'un autre. Seul le refus voyage : une acceptation s'annonce par
 * `community:member-joined`.
 */
@Serializable
data class CommunityJoinRequestDecidedEvent(
    val communityId: String,
    val decision: String? = null,
    val retryAt: String? = null,
    val at: String? = null,
) {
    /** L'instant à partir duquel une nouvelle demande est possible, ou `null` si la charge n'annonce aucun refus lisible. */
    val refusedUntil: Instant?
        get() = retryAt?.takeIf { communityId.isNotEmpty() && decision == REJECTED }?.let(::instantOrNull)

    companion object {
        const val REJECTED = "rejected"
    }
}

/**
 * Le refus que le détail DIT au lecteur (« Demande refusée — nouvelle demande possible le … ») : la
 * date servie tant qu'elle est à venir, jamais pour un membre ni pendant une demande en attente
 * (miroir `membershipActionOf` du web, `lib/communities/view.ts`).
 */
fun ApiCommunity.joinDeclinedUntil(now: Instant): Instant? {
    if (currentUserRole != null || hasPendingJoinRequest) return null
    return currentUserJoinRetryAt?.let(::instantOrNull)?.takeIf { it.isAfter(now) }
}

/**
 * La fiche tenue, réécrite par le refus — `null` quand il ne la concerne pas (autre communauté,
 * charge illisible) ou que le lecteur y tient déjà un rôle (entré par une autre porte). La charge dit
 * tout : aucune relecture (web `applyCommunityJoinRequestDecidedEvent`).
 */
fun ApiCommunity.applying(event: CommunityJoinRequestDecidedEvent): ApiCommunity? {
    if (event.communityId != id || currentUserRole != null) return null
    val retryAt = event.retryAt?.takeIf { event.refusedUntil != null } ?: return null
    return copy(currentUserJoinRequest = null, currentUserJoinRetryAt = retryAt)
}

private fun instantOrNull(raw: String): Instant? =
    try {
        Instant.parse(raw)
    } catch (_: DateTimeParseException) {
        null
    }
