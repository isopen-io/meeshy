package me.meeshy.app.conversations

import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ParticipantLeftEvent

/**
 * Pure SSOT for the "does this removal event purge a conversation I own" decision.
 *
 * A removed conversation must drop from the visible list *and* shed any dangling
 * stars — a bookmark can never outlive the conversation it points at. Only two
 * socket events represent a removal from *this* device's perspective: the whole
 * conversation being deleted for everyone, or the current user being the
 * participant who left. Any other participant leaving is inert here (the row
 * stays; only its metadata may change, handled by `conversation:updated`).
 *
 * Kept free of the store/repository so the decision is fully JVM-testable.
 */
object ConversationPurge {

    /**
     * The conversationId to purge when a whole conversation is deleted for
     * everyone; null (inert) when the event carries no usable id.
     */
    fun onConversationDeleted(event: ConversationDeletedSocketEvent): String? =
        event.conversationId.takeIf { it.isNotBlank() }

    /**
     * The conversationId to purge when [currentUserId] is the participant who
     * left — the conversation is gone from *their* list. Another participant
     * leaving, an unknown/blank current user, or a blank conversation id is
     * inert (null).
     */
    fun onParticipantLeft(event: ParticipantLeftEvent, currentUserId: String?): String? =
        if (!currentUserId.isNullOrBlank() &&
            event.userId == currentUserId &&
            event.conversationId.isNotBlank()
        ) {
            event.conversationId
        } else {
            null
        }
}
