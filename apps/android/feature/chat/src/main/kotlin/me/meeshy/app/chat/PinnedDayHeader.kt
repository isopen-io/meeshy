package me.meeshy.app.chat

/**
 * The floating "sticky" day pill (WhatsApp-style): as the reader scrolls, a single
 * date label hovers at the top of the message list, naming the day of whatever
 * content sits at the top of the viewport.
 *
 * This is the pure single-source-of-truth for *which* day that pill shows. The
 * Composable that draws it only reads [ChatListItem.DayHeader.dayMillis] back
 * through [MessageDayLabel]; the "which section governs the top" decision lives
 * here so it can be exhaustively tested.
 */
object PinnedDayHeader {

    /**
     * The `dayMillis` of the [ChatListItem.DayHeader] governing the topmost visible
     * row, or `null` when nothing should float. Equivalent to
     * `governingDayMillis(items, firstVisibleIndex, ChatListOrientation.TopDown)`
     * — kept for [ChatListOrientation.TopDown] callers/tests that predate the
     * orientation parameter.
     *
     * Returns `null` for an empty list, a negative [firstVisibleIndex], a top row
     * that sits above the first day header (e.g. the encryption notice at index 0),
     * or when the topmost visible row *is* a [ChatListItem.DayHeader] — in that case
     * the inline header is already on screen, so a floating duplicate would be
     * redundant. A [firstVisibleIndex] past the end clamps to the last row.
     */
    fun governingDayMillis(items: List<ChatListItem>, firstVisibleIndex: Int): Long? =
        governingDayMillis(items, firstVisibleIndex, ChatListOrientation.TopDown)

    /**
     * Orientation-aware form of the two-argument overload above. [items] must
     * already be the list actually rendered by the `LazyColumn` — oldest-first
     * in [ChatListOrientation.TopDown], `items.asReversed()` (newest-first) in
     * [ChatListOrientation.BottomUp] — and [topIndex] the index, within THAT
     * list, of the row currently at the visual top of the viewport (see
     * [ChatScrollGeometry.topEdgeIndex]).
     *
     * The scan direction flips with orientation: reversing item order also
     * reverses each day's `[DayHeader, message...]` block into
     * `[message..., DayHeader]`, so a header now sits AFTER (not before) the
     * rows it governs — [ChatListOrientation.BottomUp] scans forward
     * (`topIndex..items.lastIndex`) instead of backward to find it.
     */
    fun governingDayMillis(items: List<ChatListItem>, topIndex: Int, orientation: ChatListOrientation): Long? {
        if (items.isEmpty() || topIndex < 0) return null
        val top = topIndex.coerceAtMost(items.lastIndex)
        if (items[top] is ChatListItem.DayHeader) return null
        val scanRange = when (orientation) {
            ChatListOrientation.TopDown -> top downTo 0
            ChatListOrientation.BottomUp -> top..items.lastIndex
        }
        for (index in scanRange) {
            val header = items[index] as? ChatListItem.DayHeader ?: continue
            return header.dayMillis
        }
        return null
    }
}
