package me.meeshy.sdk.model

/**
 * One server page of `GET /conversations/{id}/participants` — the wire shape is
 * cursor-based (`nextCursor`/`hasMore`/`totalCount`), not offset-based.
 */
data class MemberRosterPage(
    val members: List<PaginatedParticipant> = emptyList(),
    val nextCursor: String? = null,
    val hasMore: Boolean = false,
    val totalCount: Int? = null,
)

/**
 * Immutable accumulator of a conversation's paginated member roster.
 *
 * Everything the members sheet needs to decide what to render and whether another
 * page is worth asking for lives here, so the ViewModel stays a thin caller and the
 * paging rules are unit-testable without a network or a composition.
 *
 * Two guarantees the iOS reference (`ParticipantsView`) leaves to chance:
 * - **A page is only "more" when it says so AND hands back a cursor.** A server
 *   answering `hasMore: true, nextCursor: null` would otherwise spin the list
 *   forever re-requesting the same first page.
 * - **Ids are deduplicated on append.** Cursor pagination over a roster that is
 *   being mutated concurrently (someone joins, someone is removed) can legitimately
 *   repeat a row across two pages; a repeat must never render twice.
 */
data class MemberRoster(
    val members: List<PaginatedParticipant> = emptyList(),
    val nextCursor: String? = null,
    val hasMore: Boolean = false,
    val totalCount: Int? = null,
) {
    /**
     * The member count to show in the header: the server's roster total when it sent
     * one (honest while only the first page is loaded), else what is actually loaded.
     */
    val displayCount: Int get() = totalCount ?: members.size

    /** Replace everything — a fresh first page, a new search, a pull-to-refresh. */
    fun withFirstPage(page: MemberRosterPage): MemberRoster = paged(page.members, page)

    /** Append the next page, dropping any row already loaded. */
    fun withNextPage(page: MemberRosterPage): MemberRoster {
        val known = members.map { it.id }.toSet()
        return paged(members + page.members.filterNot { it.id in known }, page)
    }

    /**
     * Drop a member the caller just removed (or who left). [userIdOrParticipantId]
     * matches either identifier: a removal is driven by user id, a socket event may
     * carry the participant id. The server total follows so the header stays honest
     * without a refetch.
     */
    fun withoutUser(userIdOrParticipantId: String): MemberRoster {
        val remaining = members.filterNot { it.matches(userIdOrParticipantId) }
        if (remaining.size == members.size) return this
        val removed = members.size - remaining.size
        return copy(
            members = remaining,
            totalCount = totalCount?.let { (it - removed).coerceAtLeast(0) },
        )
    }

    /** Rewrite one member's conversation role in place (promotion, demotion). */
    fun withRole(userIdOrParticipantId: String, role: MemberRole): MemberRoster {
        if (members.none { it.matches(userIdOrParticipantId) }) return this
        return copy(
            members = members.map { member ->
                if (member.matches(userIdOrParticipantId)) {
                    member.copy(conversationRole = role.wireValue)
                } else {
                    member
                }
            },
        )
    }

    private fun paged(members: List<PaginatedParticipant>, page: MemberRosterPage): MemberRoster =
        MemberRoster(
            members = members,
            nextCursor = page.nextCursor,
            hasMore = page.hasMore && page.nextCursor != null,
            totalCount = page.totalCount,
        )

    companion object {
        val EMPTY: MemberRoster = MemberRoster()
    }
}

/** True when [id] is this participant's user id or its participant id. */
fun PaginatedParticipant.matches(id: String): Boolean = userId == id || this.id == id

/** The conversation role this member holds, defaulting to [MemberRole.MEMBER]. */
val PaginatedParticipant.role: MemberRole get() = MemberRole.from(conversationRole)

/**
 * The name to render for this member — port of iOS `PaginatedParticipant.name`:
 * display name, else the joined first/last name, else the username, else `"?"`.
 */
val PaginatedParticipant.displayLabel: String
    get() = displayName?.takeIf { it.isNotBlank() }
        ?: listOfNotNull(firstName, lastName)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .takeIf { it.isNotBlank() }
        ?: username?.takeIf { it.isNotBlank() }
        ?: "?"
