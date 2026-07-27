package me.meeshy.app.chat

/**
 * Pure SSOT for where the message list lands the first time a conversation
 * opens — the port of iOS `ConversationViewModel`'s open-scroll: reveal the
 * "new messages" boundary if there is unread history, otherwise settle on the
 * newest message (the bottom).
 *
 * Operates on the already-interleaved [ChatListItem] rows so day headers never
 * throw off the index: the separator's own row index is returned verbatim,
 * placing the boundary at the top of the viewport rather than the message it
 * sits above. Callers scroll to this index exactly once on open; a later
 * message arrival never re-derives it.
 */
object InitialScrollTarget {

    /**
     * The row index to scroll to on open, or `null` when the list is empty
     * (nothing to scroll to). The [ChatListItem.UnreadSeparator] row wins when
     * present; otherwise the last row (bottom).
     */
    fun of(items: List<ChatListItem>): Int? {
        if (items.isEmpty()) return null
        val separator = items.indexOfFirst { it is ChatListItem.UnreadSeparator }
        return if (separator >= 0) separator else items.lastIndex
    }
}
