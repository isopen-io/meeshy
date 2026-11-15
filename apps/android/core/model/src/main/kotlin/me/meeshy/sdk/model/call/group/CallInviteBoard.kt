package me.meeshy.sdk.model.call.group

import me.meeshy.sdk.model.call.CallInviteOutcome
import me.meeshy.sdk.model.call.CallInvitedUser

/** Une invitation qui sonne pendant l'appel — iOS `CallPendingInvite`. */
data class CallPendingInvite(
    val userId: String,
    val displayName: String,
    val avatarUrl: String? = null,
) {
    companion object {
        /** Le nom affiché est le nom d'affichage, sinon l'identifiant, comme iOS. */
        fun of(user: CallInvitedUser): CallPendingInvite = CallPendingInvite(
            userId = user.userId,
            displayName = user.displayName?.takeIf { it.isNotBlank() } ?: user.username,
            avatarUrl = user.avatar?.takeIf { it.isNotBlank() },
        )
    }
}

/** Le mot de retour d'une invitation — iOS `CallControlsNotice` (`inviteFailed`, `inviteDeclined`, `inviteUnanswered`). */
sealed interface CallInviteNotice {
    /** La passerelle a refusé l'invitation (`call:invite-participant` à accusé négatif). */
    data object Failed : CallInviteNotice

    /** L'invité a refusé (`call:invite-declined`). */
    data class Declined(val name: String) : CallInviteNotice

    /** L'invité n'a pas répondu à temps (`call:invite-expired`, sonnerie de la passerelle écoulée). */
    data class Unanswered(val name: String) : CallInviteNotice
}

/**
 * Les invitations qui sonnent dans l'appel en cours et le mot qui suit leur fin — miroir de l'état de iOS
 * `CallControlsController` (`invites`, `notice`). Valeur immuable : chaque événement rend un nouveau tableau.
 *
 * - une invitation s'ajoute une fois, dans l'ordre où elle commence à sonner ;
 * - inviter efface le mot précédent ;
 * - un refus ou une absence de réponse ne se dit que pour une invitation qui sonnait encore ;
 * - un invité qui rejoint, ou une invitation que la passerelle refuse, quitte la bande sans autre mot que l'échec.
 */
data class CallInviteBoard(
    val invites: List<CallPendingInvite> = emptyList(),
    val notice: CallInviteNotice? = null,
) {
    val ringingIds: Set<String> get() = invites.mapTo(LinkedHashSet()) { it.userId }

    fun isRinging(userId: String): Boolean = invites.any { it.userId == userId }

    /** Le geste « inviter » : l'ami sonne aussitôt (optimiste) et le mot précédent s'efface. */
    fun inviting(invite: CallPendingInvite): CallInviteBoard = ringing(invite).copy(notice = null)

    /** `call:participant-invited` : quelqu'un sonne — une seule fois. */
    fun ringing(invite: CallPendingInvite): CallInviteBoard =
        if (invite.userId.isBlank() || isRinging(invite.userId)) this else copy(invites = invites + invite)

    /** La passerelle refuse l'invitation : l'ami ne sonne plus, et on le dit. */
    fun refused(userId: String): CallInviteBoard = withdrawn(userId).copy(notice = CallInviteNotice.Failed)

    /** L'invité a rejoint l'appel : il quitte la bande, sans mot. */
    fun withdrawn(userId: String): CallInviteBoard =
        if (!isRinging(userId)) this else copy(invites = invites.filterNot { it.userId == userId })

    /** `call:invite-declined` / `call:invite-expired` : la tuile « Sonne… » se résout, et le mot le dit. */
    fun settled(userId: String, outcome: CallInviteOutcome): CallInviteBoard {
        val invite = invites.firstOrNull { it.userId == userId } ?: return this
        val notice = when (outcome) {
            CallInviteOutcome.DECLINED -> CallInviteNotice.Declined(invite.displayName)
            CallInviteOutcome.EXPIRED -> CallInviteNotice.Unanswered(invite.displayName)
        }
        return copy(invites = invites - invite, notice = notice)
    }

    fun dismissingNotice(): CallInviteBoard = if (notice == null) this else copy(notice = null)

    companion object {
        /** Le mot de retour s'efface seul au bout de 4 s — iOS `CallControlsNoticePill`. */
        const val NOTICE_DISPLAY_MILLIS: Long = 4_000L
    }
}
