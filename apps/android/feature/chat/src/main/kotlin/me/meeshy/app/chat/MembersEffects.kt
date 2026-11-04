package me.meeshy.app.chat

import me.meeshy.sdk.model.MemberRoleAction
import me.meeshy.sdk.model.PaginatedParticipant

/** Le retour haptique d'une action de la feuille des membres : succès ou échec, comme `HapticFeedback` (iOS). */
enum class FeedbackHaptic { SUCCESS, ERROR }

/** Les effets ponctuels de la feuille des membres : un retour haptique, ou la sortie de la conversation après le départ. */
sealed interface MembersEffect {
    data class Haptic(val kind: FeedbackHaptic) : MembersEffect
    data object Left : MembersEffect
}

/** Un changement de rôle demandé, en attente de la confirmation « Changer le rôle ? ». */
data class PendingRoleChange(val member: PaginatedParticipant, val action: MemberRoleAction)
