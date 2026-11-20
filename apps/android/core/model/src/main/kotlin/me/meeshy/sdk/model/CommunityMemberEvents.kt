package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * `community:member-joined` (#18766, consommé ici pour #18768) — miroir de
 * `CommunityMemberJoinedEventData` (`packages/shared/types/socketio-events/community.ts`). La personne
 * n'est nommée que par son identifiant : ni profil, ni présence, ni coordonnées.
 */
@Serializable
data class CommunityMemberJoinedEvent(
    val communityId: String,
    val userId: String,
    val role: String,
    val via: String? = null,
    val memberCount: Int,
    val at: String? = null,
) {
    val change: CommunityMemberChange?
        get() = CommunityMemberChange.roleOf(role)?.let { CommunityMemberChange.of(CommunityMemberChange.Kind.JOINED, communityId, userId, memberCount, it) }
}

/** `community:member-left` — miroir de `CommunityMemberLeftEventData` (`reason` : `left` | `removed`). */
@Serializable
data class CommunityMemberLeftEvent(
    val communityId: String,
    val userId: String,
    val reason: String? = null,
    val memberCount: Int,
    val at: String? = null,
) {
    val change: CommunityMemberChange?
        get() = CommunityMemberChange.of(CommunityMemberChange.Kind.LEFT, communityId, userId, memberCount, role = null)
}

/** `community:member-role-updated` — miroir de `CommunityMemberRoleUpdatedEventData`. */
@Serializable
data class CommunityMemberRoleUpdatedEvent(
    val communityId: String,
    val userId: String,
    val role: String,
    val memberCount: Int,
    val at: String? = null,
) {
    val change: CommunityMemberChange?
        get() = CommunityMemberChange.roleOf(role)?.let { CommunityMemberChange.of(CommunityMemberChange.Kind.ROLE_UPDATED, communityId, userId, memberCount, it) }
}

/**
 * Ce que les trois événements de l'effectif disent, une fois lus (web `MemberChange`,
 * `apps/web/src/lib/api/community-member-live.ts`) : l'effectif actif après le geste, et le rôle que
 * la personne TIENT désormais — `null` quand elle est sortie. Une charge sans communauté, sans
 * personne, à l'effectif négatif ou au rôle inconnu ne se lit pas.
 */
data class CommunityMemberChange(
    val kind: Kind,
    val communityId: String,
    val userId: String,
    val memberCount: Int,
    val role: MemberRole?,
) {
    /** Le geste : une entrée, un départ (d'elle-même ou retirée), un rôle changé. */
    enum class Kind { JOINED, LEFT, ROLE_UPDATED }

    val hasLeft: Boolean get() = kind == Kind.LEFT

    companion object {
        private val ROLES = listOf(MemberRole.ADMIN, MemberRole.MODERATOR, MemberRole.MEMBER)

        fun roleOf(raw: String): MemberRole? = ROLES.firstOrNull { it.wireValue == raw }

        fun of(kind: Kind, communityId: String, userId: String, memberCount: Int, role: MemberRole?): CommunityMemberChange? =
            if (communityId.isEmpty() || userId.isEmpty() || memberCount < 0) {
                null
            } else {
                CommunityMemberChange(kind, communityId, userId, memberCount, role)
            }
    }
}

/**
 * La fiche tenue, réécrite par un geste de l'effectif — `null` quand il ne la concerne pas ou n'y
 * change rien. `memberCount` se recopie ; la ligne de la personne, quand la fiche la tient, suit son
 * rôle ou disparaît. Le LECTEUR qui entre y reçoit sa ligne ET son rôle servi (`currentUserRole`,
 * quand la fiche le tient, que [CommunityMembership] lit en premier, #16602) ; entré, sa demande
 * d'entrée n'attend plus rien. Un tiers qui entre n'y est pas inventé : la charge ne porte pas son
 * profil, et la liste des membres se relit.
 */
fun ApiCommunity.applying(change: CommunityMemberChange, viewerId: String?): ApiCommunity? {
    if (change.communityId != id) return null
    val held = members
    val next = when {
        held == null && change.userId != viewerId -> null
        change.role == null -> held?.filterNot { it.userId == change.userId }
        held.orEmpty().any { it.userId == change.userId } ->
            held.orEmpty().map { if (it.userId == change.userId) it.copy(role = change.role.wireValue) else it }
        change.userId == viewerId -> held.orEmpty() + viewerLine(change, change.role)
        else -> held
    }
    val isViewer = viewerId != null && change.userId == viewerId
    return copy(
        memberCount = change.memberCount,
        members = next,
        currentUserRole = if (isViewer && currentUserRole != null) change.role?.wireValue else currentUserRole,
        currentUserJoinRequest = if (isViewer && change.role != null) null else currentUserJoinRequest,
        currentUserJoinRetryAt = if (isViewer && change.role != null) null else currentUserJoinRetryAt,
    ).takeIf { it != this }
}

private fun ApiCommunity.viewerLine(change: CommunityMemberChange, role: MemberRole) = ApiCommunityMember(
    id = "${id}:${change.userId}",
    communityId = id,
    userId = change.userId,
    role = role.wireValue,
)

/** Une page tenue, réécrite sur la seule ligne visée ; `null` quand aucune ne change. */
fun List<ApiCommunity>.applying(change: CommunityMemberChange, viewerId: String?): List<ApiCommunity>? =
    map { held -> held.applying(change, viewerId) ?: held }.takeIf { it != this }

/**
 * La première page de la liste des membres tenue, réécrite : un départ retire la ligne, un rôle
 * changé la suit. `null` quand rien n'y change — ou quand le geste est une ENTRÉE, que seule une
 * relecture sait écrire (la charge ne porte pas le profil).
 */
fun List<ApiCommunityMember>.applyingMember(change: CommunityMemberChange): List<ApiCommunityMember>? {
    if (none { it.userId == change.userId }) return null
    val next = when (val role = change.role) {
        null -> filterNot { it.userId == change.userId }
        else -> map { if (it.userId == change.userId) it.copy(role = role.wireValue) else it }
    }
    return next.takeIf { it != this }
}
