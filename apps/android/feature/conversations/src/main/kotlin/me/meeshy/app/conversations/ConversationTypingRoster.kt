package me.meeshy.app.conversations

import me.meeshy.sdk.model.TypingEvent

/**
 * A peer composing a message in some conversation, identified by [userId] so two users
 * who happen to share a [displayName] never collapse into one row entry, and stopping
 * one never removes the other. [displayName] is already resolved (never blank): the
 * roster falls back `displayName → username → userId` when the socket payload is thin.
 */
data class ConversationTyper(
    val userId: String,
    val displayName: String,
)

/**
 * Pure, multi-conversation SSOT of "who is typing where" — the conversation-list analog
 * of :feature:chat's single-conversation [TypingParticipants]. State is a map
 * `conversationId → (userId → ConversationTyper)`. Mirrors iOS
 * `ConversationListViewModel.typers`:
 * - the local user is never shown typing to themselves ([selfId] guard),
 * - a `typing:stop` removes exactly that user, so a group row stays lit while any other
 *   peer is still composing (full clear only when the last typer stops),
 * - the surfaced name is chosen deterministically (sorted by `displayName` then `userId`)
 *   so a re-render never flickers between two simultaneous typers.
 *
 * Every transition returns the *same* map instance when it is inert (a self/blank start,
 * a stop for an absent user), so a caller can cheaply detect a no-op by reference.
 */
object ConversationTypingRoster {

    fun started(
        state: Map<String, Map<String, ConversationTyper>>,
        event: TypingEvent,
        selfId: String?,
    ): Map<String, Map<String, ConversationTyper>> {
        val conversationId = event.conversationId
        val userId = event.userId
        if (conversationId.isBlank() || userId.isBlank() || userId == selfId) return state
        val name = event.displayName?.takeIf { it.isNotBlank() }
            ?: event.username?.takeIf { it.isNotBlank() }
            ?: userId
        val updated = state[conversationId].orEmpty() + (userId to ConversationTyper(userId, name))
        return state + (conversationId to updated)
    }

    fun stopped(
        state: Map<String, Map<String, ConversationTyper>>,
        conversationId: String,
        userId: String,
    ): Map<String, Map<String, ConversationTyper>> {
        val current = state[conversationId] ?: return state
        if (!current.containsKey(userId)) return state
        val remaining = current - userId
        return if (remaining.isEmpty()) state - conversationId else state + (conversationId to remaining)
    }

    /**
     * The single surfaced typer's display name for [conversationId], chosen
     * deterministically, or `null` when nobody there is typing.
     */
    fun typingDisplayName(
        state: Map<String, Map<String, ConversationTyper>>,
        conversationId: String,
    ): String? {
        val typers = state[conversationId]?.values ?: return null
        return typers.minWithOrNull(compareBy({ it.displayName }, { it.userId }))?.displayName
    }
}
