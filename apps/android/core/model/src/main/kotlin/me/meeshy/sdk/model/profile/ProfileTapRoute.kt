package me.meeshy.sdk.model.profile

import me.meeshy.sdk.model.PaginatedParticipant

/**
 * Où mène le toucher d'une personne dans la messagerie (miroir de la règle iOS : un compte ouvre la
 * fiche utilisateur, un visiteur sans compte ouvre la fiche de PARTICIPATION de la conversation).
 * Un `senderId` — un `Participant.id` — n'est jamais traité comme un compte.
 */
sealed interface ProfileTapRoute {
    /** Un compte : la fiche utilisateur, par l'ouvreur global. */
    data class Account(val user: ProfileSheetUser) : ProfileTapRoute

    /** Un visiteur sans compte : la fiche de participation de la conversation d'où l'on vient. */
    data class Participation(val participantId: String, val user: ProfileSheetUser) : ProfileTapRoute

    /** Aucune identité exploitable : le toucher n'ouvre rien. */
    data object None : ProfileTapRoute

    companion object {
        fun of(user: ProfileSheetUser): ProfileTapRoute {
            if (!user.isAnonymous) return Account(user)
            val participantId = user.participantId?.takeIf { it.isNotBlank() } ?: return None
            return Participation(participantId, user)
        }
    }
}

/**
 * Un membre de conversation. Sans `userId` il n'a pas de compte : [ProfileSheetUser.userId] reste nul
 * et son `Participant.id` voyage dans [ProfileSheetUser.participantId].
 */
fun ProfileSheetUser.Companion.from(member: PaginatedParticipant): ProfileSheetUser {
    val accountId = member.userId?.takeIf { it.isNotBlank() }
    val name = member.displayName?.takeIf { it.isNotBlank() }
        ?: listOfNotNull(member.firstName, member.lastName).filter { it.isNotBlank() }.joinToString(" ").takeIf { it.isNotEmpty() }
    return ProfileSheetUser(
        userId = accountId,
        username = member.username?.takeIf { it.isNotBlank() } ?: name ?: "?",
        displayName = name,
        avatarUrl = member.avatar,
        participantId = member.id.takeIf { it.isNotBlank() },
        isAnonymous = accountId == null,
    )
}
