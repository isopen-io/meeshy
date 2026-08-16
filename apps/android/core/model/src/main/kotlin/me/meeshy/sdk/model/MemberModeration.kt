package me.meeshy.sdk.model

/**
 * A role change offered on a member's row. [target] is the role the member ends up
 * with — always one of the three the gateway's
 * `PATCH /conversations/:id/participants/:userId/role` enumerates (`creator` is
 * never a reachable target: ownership is not transferable through this route).
 */
enum class MemberRoleAction(val target: MemberRole) {
    PROMOTE_MODERATOR(MemberRole.MODERATOR),
    PROMOTE_ADMIN(MemberRole.ADMIN),
    DEMOTE_MODERATOR(MemberRole.MODERATOR),
    DEMOTE_MEMBER(MemberRole.MEMBER),
}

/**
 * Which moderation affordances a viewer may see on another member's row — the pure
 * client-side mirror of the gateway's own checks in `routes/conversations/
 * participants.ts` (role patch: creator or admin; removal: admin/moderator or self).
 *
 * The server remains the authority; this only decides what to *offer*, so a member
 * is never shown a control that would come back 403.
 */
object MemberModeration {

    /**
     * Removal rules, ported from iOS `ParticipantsView.canRemoveParticipant`:
     * never yourself (leaving is its own explicit action, not a row swipe), never
     * the creator, admins and above may remove anyone else, and a moderator may
     * remove plain members only.
     */
    fun canRemove(actor: MemberRole, target: MemberRole, isSelf: Boolean): Boolean = when {
        isSelf -> false
        target == MemberRole.CREATOR -> false
        actor.hasMinimumRole(MemberRole.ADMIN) -> true
        else -> actor == MemberRole.MODERATOR && target == MemberRole.MEMBER
    }

    /**
     * Role changes offered on a member's row, ported from iOS
     * `ParticipantsView.contextMenuItems`: the creator may move anyone between
     * member / moderator / admin; a conversation admin may do the same except on
     * another admin (peers cannot demote each other); moderators and members get
     * nothing.
     */
    fun roleActions(actor: MemberRole, target: MemberRole, isSelf: Boolean): List<MemberRoleAction> = when {
        isSelf -> emptyList()
        target == MemberRole.CREATOR -> emptyList()
        actor == MemberRole.CREATOR -> creatorActions(target)
        actor == MemberRole.ADMIN && target != MemberRole.ADMIN -> creatorActions(target)
        else -> emptyList()
    }

    private fun creatorActions(target: MemberRole): List<MemberRoleAction> = when (target) {
        MemberRole.MEMBER -> listOf(MemberRoleAction.PROMOTE_MODERATOR, MemberRoleAction.PROMOTE_ADMIN)
        MemberRole.MODERATOR -> listOf(MemberRoleAction.PROMOTE_ADMIN, MemberRoleAction.DEMOTE_MEMBER)
        MemberRole.ADMIN -> listOf(MemberRoleAction.DEMOTE_MODERATOR, MemberRoleAction.DEMOTE_MEMBER)
        MemberRole.CREATOR -> emptyList()
    }
}
