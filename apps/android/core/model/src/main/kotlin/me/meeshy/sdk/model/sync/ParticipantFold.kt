package me.meeshy.sdk.model.sync

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ParticipantBannedEvent
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.ParticipantRoleUpdatedEvent
import me.meeshy.sdk.model.conversationlist.ConversationLivePatch

/**
 * Le pli des événements de PARTICIPANT dans la ligne de liste (miroir du pont de participants d'iOS) :
 * un départ ou un bannissement d'un AUTRE retire sa ligne du roster et baisse l'effectif ; quand le sujet
 * est MOI, la conversation disparaît ; un changement de rôle met à jour le rang du lecteur et celui de
 * la ligne du roster. Tout pli est idempotent : rejouer le même événement ne bouge plus rien.
 */
public object ParticipantFold {

    /** Ce que devient la ligne après un événement. */
    public sealed interface Outcome {
        /** Le lecteur est sorti : la conversation quitte la liste. */
        public data object Removed : Outcome

        /** La ligne a changé. */
        public data class Updated(val conversation: ApiConversation) : Outcome

        /** Rien à écrire. */
        public data object Unchanged : Outcome
    }

    public fun left(conversation: ApiConversation, event: ParticipantLeftEvent, readerId: String?): Outcome =
        departing(conversation, event.userId, event.participantId, subjectIsReader = readerId?.let(event::names) == true)

    public fun banned(conversation: ApiConversation, event: ParticipantBannedEvent, readerId: String?): Outcome =
        departing(conversation, event.userId, event.participantId, subjectIsReader = readerId?.let(event::names) == true)

    /** `participant:role-updated` : le rang du lecteur (racine) et la ligne du roster, absents conservés. */
    public fun roleUpdated(
        conversation: ApiConversation,
        event: ParticipantRoleUpdatedEvent,
        readerId: String?,
    ): ApiConversation? {
        if (event.role.isBlank()) return null
        val mine = !readerId.isNullOrBlank() && event.userId == readerId
        val roster = conversation.participants.map { participant ->
            if (participant.userId == event.userId && participant.role != event.role) {
                participant.copy(role = event.role)
            } else {
                participant
            }
        }
        val next = conversation.copy(
            participants = roster,
            currentUserRole = if (mine) event.role else conversation.currentUserRole,
            viewerCapabilities = if (mine) readerCapabilities(conversation, event) else conversation.viewerCapabilities,
        )
        return next.takeUnless { it == conversation }
    }

    /**
     * #15987 — la capacité servie au lecteur suit son rang : celle que l'événement
     * remet, sinon (serveur antérieur) celle de l'ancien rang s'efface quand le
     * rang change, et la règle locale reprend.
     */
    private fun readerCapabilities(conversation: ApiConversation, event: ParticipantRoleUpdatedEvent) =
        event.viewerCapabilities
            ?: conversation.viewerCapabilities.takeIf { conversation.currentUserRole == event.role }

    private fun departing(
        conversation: ApiConversation,
        userId: String?,
        participantId: String?,
        subjectIsReader: Boolean,
    ): Outcome {
        if (subjectIsReader) return Outcome.Removed
        val roster = conversation.participants
        val known = roster.any { matches(it.userId, it.id, userId, participantId) }
        val rosterComplete = roster.size >= conversation.memberCount
        if (!known && rosterComplete) return Outcome.Unchanged
        val withoutMember = conversation.copy(participants = roster.filterNot { matches(it.userId, it.id, userId, participantId) })
        val counted = ConversationLivePatch.applyMemberCount(withoutMember, delta = -1) ?: withoutMember
        return if (counted == conversation) Outcome.Unchanged else Outcome.Updated(counted)
    }

    private fun matches(rosterUserId: String?, rosterId: String, userId: String?, participantId: String?): Boolean =
        (userId != null && rosterUserId == userId) || (participantId != null && rosterId == participantId)
}
