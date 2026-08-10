package me.meeshy.app.chat

/**
 * Which end of the rendered [ChatListItem] list currently holds the newest
 * message. [TopDown] is the app's only mode today (oldest content at index 0,
 * newest at the last index); [BottomUp] describes the eventual bottom-anchored
 * flip (`LazyColumn(reverseLayout = true)` fed a reversed item list, so
 * storage order runs newest-to-oldest) that the §C list-inversion rewrite will
 * introduce. See `apps/android/tasks/android-routine/PROGRESS.md`'s
 * "§C inverted-list rewrite" note for the full decomposition this prepares.
 */
enum class ChatListOrientation {
    TopDown,
    BottomUp,
}

/**
 * Pure index arithmetic for the message list's scroll behaviour, factored out
 * of [ChatScreen] so it is unit-testable without a Composable/`LazyListState`
 * in the loop. Every function takes the raw indices the screen already reads
 * off `LazyListState`/`listItems` and returns a plain index or boolean — zero
 * Compose dependency.
 *
 * [ChatScreen] only ever passes [ChatListOrientation.TopDown] today, byte-for-
 * byte reproducing its pre-existing ad-hoc arithmetic; the
 * [ChatListOrientation.BottomUp] arm is proven correct here, in isolation,
 * ahead of the screen actually switching to a `reverseLayout` list.
 */
object ChatScrollGeometry {

    /** Rows within this many items of the bottom edge still count as "at the bottom". */
    const val BOTTOM_TOLERANCE_ITEMS = 2

    /** Rows within this many items of the old (top) edge trigger a load-older fetch. */
    const val LOAD_OLDER_THRESHOLD = 2

    /**
     * The row index holding the newest message — the auto-scroll-to-bottom
     * target. Stays `-1` when [lastIndex] itself is `-1` (empty list; there is
     * no row to target).
     */
    fun bottomIndex(lastIndex: Int, orientation: ChatListOrientation): Int {
        if (lastIndex < 0) return lastIndex
        return when (orientation) {
            ChatListOrientation.TopDown -> lastIndex
            ChatListOrientation.BottomUp -> 0
        }
    }

    /**
     * Whether [edgeIndex] — the last-visible row index in
     * [ChatListOrientation.TopDown], the first-visible row index in
     * [ChatListOrientation.BottomUp] — sits within [BOTTOM_TOLERANCE_ITEMS] of
     * [bottomIndex], i.e. close enough to the newest message that a new
     * arrival should auto-stick rather than leave a reader scrolled into
     * history undisturbed. A list with zero or one row ([lastIndex] `<= 0`) is
     * always considered at the bottom.
     */
    fun isNearBottom(edgeIndex: Int, lastIndex: Int, orientation: ChatListOrientation): Boolean {
        if (lastIndex <= 0) return true
        return when (orientation) {
            ChatListOrientation.TopDown -> edgeIndex >= lastIndex - BOTTOM_TOLERANCE_ITEMS
            ChatListOrientation.BottomUp -> edgeIndex <= BOTTOM_TOLERANCE_ITEMS
        }
    }

    /**
     * Whether [edgeIndex] sits within [LOAD_OLDER_THRESHOLD] of the OLD end of
     * the list — the trigger to fetch another page of history. The old end is
     * index 0 in [ChatListOrientation.TopDown] and [lastIndex] in
     * [ChatListOrientation.BottomUp] (a bottom-anchored list stores its oldest
     * row last).
     */
    fun isNearOldEnd(edgeIndex: Int, lastIndex: Int, orientation: ChatListOrientation): Boolean {
        return when (orientation) {
            ChatListOrientation.TopDown -> edgeIndex <= LOAD_OLDER_THRESHOLD
            ChatListOrientation.BottomUp -> edgeIndex >= lastIndex - LOAD_OLDER_THRESHOLD
        }
    }
}
