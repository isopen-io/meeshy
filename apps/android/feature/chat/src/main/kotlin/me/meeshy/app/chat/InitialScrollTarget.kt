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
     * present; otherwise the last row (bottom). Equivalent to
     * `of(items, ChatListOrientation.TopDown)` — kept for
     * [ChatListOrientation.TopDown] callers/tests that predate the
     * orientation parameter.
     */
    fun of(items: List<ChatListItem>): Int? = of(items, ChatListOrientation.TopDown)

    /**
     * Orientation-aware form of the single-argument overload above. [items]
     * must already be the list actually rendered by the `LazyColumn` —
     * oldest-first in [ChatListOrientation.TopDown], `items.asReversed()`
     * (newest-first) in [ChatListOrientation.BottomUp]. The
     * [ChatListItem.UnreadSeparator] search is a plain content lookup over
     * whichever list is passed in (orientation-agnostic by construction);
     * only the "no separator, land on the newest message" fallback needs
     * [orientation] — it delegates to [ChatScrollGeometry.bottomIndex].
     */
    fun of(items: List<ChatListItem>, orientation: ChatListOrientation): Int? {
        if (items.isEmpty()) return null
        val separator = items.indexOfFirst { it is ChatListItem.UnreadSeparator }
        return if (separator >= 0) separator else ChatScrollGeometry.bottomIndex(items.lastIndex, orientation)
    }
}
