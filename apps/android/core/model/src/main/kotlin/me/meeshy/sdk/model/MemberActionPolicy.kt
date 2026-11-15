package me.meeshy.sdk.model

/**
 * Which management actions a viewer's rank allows on a member, and with which address key —
 * the pure mirror of iOS `MemberActionPolicy` (settings "Gestion des membres" section).
 *
 * Coexists with [MemberModeration] (list / swipe path), as on iOS; both share
 * [MemberModeration.addressKey]. Rank changes are reserved to accounts: the role route is
 * addressed by `User.id` alone, whereas expel and ban also resolve a visitor's `Participant.id`.
 */
object MemberActionPolicy {

    enum class Kind(val targetRole: MemberRole?) {
        PROMOTE_TO_ADMIN(MemberRole.ADMIN),
        PROMOTE_TO_MODERATOR(MemberRole.MODERATOR),
        DEMOTE_TO_MEMBER(MemberRole.MEMBER),
        EXPEL(null),
        BAN(null),
        ;

        val isDestructive: Boolean get() = this == EXPEL || this == BAN
    }

    data class Action(val kind: Kind, val targetKey: String)

    fun actions(participant: PaginatedParticipant, viewerRole: MemberRole): List<Action> {
        val targetRole = participant.role
        if (viewerRole.level <= targetRole.level) return emptyList()
        val kinds = buildList {
            if (participant.userId != null) {
                if (viewerRole == MemberRole.CREATOR && targetRole.level < MemberRole.ADMIN.level) add(Kind.PROMOTE_TO_ADMIN)
                if (viewerRole.hasMinimumRole(MemberRole.ADMIN) && targetRole == MemberRole.MEMBER) add(Kind.PROMOTE_TO_MODERATOR)
                if (targetRole.level > MemberRole.MEMBER.level) add(Kind.DEMOTE_TO_MEMBER)
            }
            add(Kind.EXPEL)
            if (viewerRole.hasMinimumRole(MemberRole.ADMIN)) add(Kind.BAN)
        }
        val key = MemberModeration.addressKey(participant)
        return kinds.map { Action(it, key) }
    }

    /** The "Add a member" button is offered to moderators and above. */
    fun mayAddMember(viewerRole: MemberRole): Boolean = viewerRole.hasMinimumRole(MemberRole.MODERATOR)

    /** Local search of the settings section: case-insensitive substring of the member's label. */
    fun filter(members: List<PaginatedParticipant>, query: String): List<PaginatedParticipant> {
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) return members
        return members.filter { it.displayLabel.lowercase().contains(needle) }
    }
}
