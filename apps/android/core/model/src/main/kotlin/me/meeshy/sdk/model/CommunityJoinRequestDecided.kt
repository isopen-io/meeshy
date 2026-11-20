package me.meeshy.sdk.model

import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.Serializable

/**
 * `community:join-request-decided` (#19879, consommé ici pour #19949) — miroir de
 * `CommunityJoinRequestDecidedEventData` (`packages/shared/types/socketio-events/community.ts`). Posé
 * sur la seule room du DEMANDEUR ; la charge ne dit pas qui a tranché. Seul le refus voyage
 * aujourd'hui : une acceptation arrive par `community:member-joined`.
 */
@Serializable
data class CommunityJoinRequestDecidedEvent(
    val communityId: String,
    val decision: String,
    val retryAt: String? = null,
    val at: String? = null,
) {
    /** L'instant de la nouvelle demande possible, pour un refus lisible ; `null` sinon. */
    val rejectedUntil: Instant?
        get() = if (communityId.isEmpty() || decision != REJECTED) null else instantOrNull(retryAt)

    companion object {
        const val REJECTED = "rejected"
    }
}

/**
 * La fiche tenue, réécrite par le refus de la demande du lecteur (web
 * `applyCommunityJoinRequestDecidedEvent`) : « Demande envoyée » devient « Demande refusée » jusqu'à
 * `retryAt`, sans relecture. `null` quand le refus ne la concerne pas, est illisible, ou que le
 * lecteur est déjà membre (entré par une autre porte).
 */
fun ApiCommunity.applying(decided: CommunityJoinRequestDecidedEvent): ApiCommunity? {
    if (decided.communityId != id || currentUserRole != null) return null
    decided.rejectedUntil ?: return null
    return copy(currentUserJoinRequest = null, currentUserJoinRetryAt = decided.retryAt).takeIf { it != this }
}

/**
 * Jusqu'à quand le lecteur lit « Demande refusée » : l'instant servi s'il est encore à venir, jamais
 * pour un membre ni pendant qu'une demande attend (web `membershipActionOf`). Passé, la demande est de
 * nouveau possible.
 */
fun ApiCommunity.joinDeclinedUntil(now: Instant): Instant? {
    if (currentUserRole != null || hasPendingJoinRequest) return null
    return instantOrNull(currentUserJoinRetryAt)?.takeIf { it.isAfter(now) }
}

private fun instantOrNull(raw: String?): Instant? =
    raw?.let {
        try {
            Instant.parse(it)
        } catch (_: DateTimeParseException) {
            null
        }
    }
