package me.meeshy.sdk.model

/**
 * The write-role hierarchy exactly as the gateway names it at the schema
 * (`defaultWriteRole`) — port of `WRITE_ROLE_RANK`
 * (`services/gateway/src/services/messaging/conversationWriteAdmission.ts`).
 * `everyone` sits below [MemberRole]'s own floor (`member`), which is why this
 * lives as its own string-keyed table rather than reusing [MemberRole.level].
 */
private val WRITE_ROLE_RANK: Map<String, Int> = mapOf(
    "everyone" to 0,
    "member" to 1,
    "moderator" to 2,
    "admin" to 3,
    "creator" to 4,
)

/** Rank an announcement channel requires — it PRIMES over [ApiConversation.defaultWriteRole]. */
private const val ANNOUNCEMENT_REQUIRED_ROLE = "admin"

/**
 * Container types with no write hierarchy at all — port of
 * `WRITE_HIERARCHY_FREE_TYPES`. `global` has no moderation tier; a `direct`
 * has no admin over its lone peer, so neither `defaultWriteRole` nor
 * `isAnnouncementChannel` (both legacy-writable, never intentionally set on
 * these types) is allowed to restrict them.
 */
private val WRITE_HIERARCHY_FREE_TYPES: Set<String> = setOf("global", "direct")

/**
 * Whether [currentUserId] may write a message into this conversation — the
 * client-side mirror of the gateway's rank check in
 * `conversationWriteAdmission.ts`, plus the two additional gates a picker
 * must apply before ever attempting a send: the conversation must still be
 * active, and the reader must not have soft-deleted it for themselves.
 *
 * An absent write setting is PERMISSIVE (rank 0, `everyone`), mirroring the
 * gateway: a conversation created before the write-role migration allows
 * anyone. A caller not resolvable in [ApiConversation.participants] (and no
 * server-computed [ApiConversation.currentUserRole]) defaults to `member`,
 * matching [MemberRole.from]'s own default.
 */
fun ApiConversation.mayCurrentUserWrite(currentUserId: String? = null): Boolean {
    if (isActive == false) return false
    if (resolvedPreferences?.deletedForUserAt != null) return false
    if (type in WRITE_HIERARCHY_FREE_TYPES) return true

    val requiredRole = if (isAnnouncementChannel) ANNOUNCEMENT_REQUIRED_ROLE else (defaultWriteRole ?: "everyone")
    val requiredRank = WRITE_ROLE_RANK[requiredRole] ?: 0
    if (requiredRank == 0) return true

    val userRoleWire = currentUserRole ?: currentUserRole(currentUserId).wireValue
    val userRank = WRITE_ROLE_RANK[userRoleWire] ?: WRITE_ROLE_RANK.getValue("member")
    return userRank >= requiredRank
}
