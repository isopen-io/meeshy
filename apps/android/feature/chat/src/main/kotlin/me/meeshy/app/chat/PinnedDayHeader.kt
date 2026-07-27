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
     * row, or `null` when nothing should float.
     *
     * Returns `null` for an empty list, a negative [firstVisibleIndex], a top row
     * that sits above the first day header (e.g. the encryption notice at index 0),
     * or when the topmost visible row *is* a [ChatListItem.DayHeader] — in that case
     * the inline header is already on screen, so a floating duplicate would be
     * redundant. A [firstVisibleIndex] past the end clamps to the last row.
     */
    fun governingDayMillis(items: List<ChatListItem>, firstVisibleIndex: Int): Long? {
        if (items.isEmpty() || firstVisibleIndex < 0) return null
        val top = firstVisibleIndex.coerceAtMost(items.lastIndex)
        if (items[top] is ChatListItem.DayHeader) return null
        for (index in top downTo 0) {
            val header = items[index] as? ChatListItem.DayHeader ?: continue
            return header.dayMillis
        }
        return null
    }
}
