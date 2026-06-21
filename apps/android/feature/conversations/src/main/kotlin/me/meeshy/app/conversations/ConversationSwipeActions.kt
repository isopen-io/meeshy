package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversation

/**
 * Conversation-list swipe actions — port of `ConversationListView+Rows.swift`
 * (`leadingSwipeActions` / `trailingSwipeActions`).
 *
 * This layer is pure: it decides *which* actions a row offers and their current
 * toggled state. The UI ([ConversationListScreen]) maps each action to its
 * icon / label / tint so leaf rows stay free of business logic.
 *
 * Scoped to the toggles that ride the single `user-preferences/conversations/:id`
 * endpoint (pin, mute, archive). Lock, block, mark-unread and hide depend on
 * managers/endpoints not yet ported and are added in later slices.
 */
enum class ConversationSwipeAction { PIN, MUTE, ARCHIVE }

/**
 * A swipe action for a given row. [active] carries the dimension's current state
 * (pinned / muted / archived) so the UI can flip the icon + label and the
 * ViewModel can toggle to its opposite.
 */
data class ConversationSwipeItem(
    val action: ConversationSwipeAction,
    val active: Boolean,
)

object ConversationSwipeActions {

    /** Leading (start) edge — pin then mute, mirroring iOS. */
    fun leading(conversation: ApiConversation): List<ConversationSwipeItem> = listOf(
        ConversationSwipeItem(ConversationSwipeAction.PIN, conversation.isPinned),
        ConversationSwipeItem(ConversationSwipeAction.MUTE, conversation.isMuted),
    )

    /** Trailing (end) edge — archive, mirroring iOS (block/mark-unread/hide deferred). */
    fun trailing(conversation: ApiConversation): List<ConversationSwipeItem> = listOf(
        ConversationSwipeItem(ConversationSwipeAction.ARCHIVE, conversation.isArchived),
    )
}

internal val ApiConversation.isPinned: Boolean get() = preferences?.isPinned == true
internal val ApiConversation.isMuted: Boolean get() = preferences?.isMuted == true
internal val ApiConversation.isArchived: Boolean get() = preferences?.isArchived == true
