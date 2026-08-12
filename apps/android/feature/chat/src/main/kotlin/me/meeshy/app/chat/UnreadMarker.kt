package me.meeshy.app.chat

import me.meeshy.ui.component.bubble.BubbleContent

/**
 * Pure SSOT for the "unread messages" boundary — port of the iOS
 * `ConversationViewModel` first-unread derivation
 * (`unreadStartIndex = messages.count - initialUnreadCount`, guarded by
 * `!candidate.isMe`).
 *
 * The boundary is computed **once** from the initial unread count captured
 * before the conversation is marked read; the caller latches the result so a
 * later message arrival never shifts the divider.
 */
object UnreadMarker {

    /**
     * The id of the first unread message in [bubbles] (ascending order), or
     * `null` when there is no boundary to draw:
     * - a non-positive [unreadCount] (nothing unread),
     * - an empty window,
     * - an [unreadCount] larger than the loaded window (can't place it), or
     * - a boundary that lands on the viewer's own message (you never "unread"
     *   your own send).
     */
    fun firstUnreadId(bubbles: List<BubbleContent>, unreadCount: Int): String? {
        if (unreadCount <= 0) return null
        if (unreadCount > bubbles.size) return null
        val candidate = bubbles[bubbles.size - unreadCount]
        if (candidate.isOutgoing) return null
        return candidate.messageId
    }
}
