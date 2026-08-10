package me.meeshy.app.chat

/**
 * Which end of the rendered [ChatListItem] list currently holds the newest
 * message. [BottomUp] is [ChatScreen]'s shipped mode (`LazyColumn(reverseLayout
 * = true)` fed `listItems.asReversed()`, so the rendered list runs
 * newest-to-oldest and the newest message sits at index 0, pinned to the
 * bottom edge); [TopDown] (oldest content at index 0, newest at the last
 * index) is kept as the pre-flip mode, still exercised by every function's
 * original test coverage. See `apps/android/tasks/android-routine/PROGRESS.md`'s
 * "§C inverted-list rewrite" note for the full decomposition this completes.
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
 * [ChatScreen] wires every call site through [ChatListOrientation.BottomUp]
 * (the shipped `reverseLayout` list); the [ChatListOrientation.TopDown] arm
 * stays fully tested as the pre-flip behaviour every function reproduced
 * byte-for-byte before the screen switched over.
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

    /**
     * Which of `LazyListState`'s two Compose-native readings — the lowest
     * visible index ([firstVisibleIndex]) or the highest ([lastVisibleIndex])
     * — currently sits at the chat's BOTTOM edge (nearest the newest
     * message). In [ChatListOrientation.TopDown] the newest message renders
     * last, so the highest visible index is the bottom edge; under
     * `reverseLayout` ([ChatListOrientation.BottomUp]) the newest message is
     * row 0, so the lowest visible index is the bottom edge instead. Feed the
     * result straight into [isNearBottom]'s `edgeIndex`.
     */
    fun bottomEdgeIndex(firstVisibleIndex: Int, lastVisibleIndex: Int, orientation: ChatListOrientation): Int {
        return when (orientation) {
            ChatListOrientation.TopDown -> lastVisibleIndex
            ChatListOrientation.BottomUp -> firstVisibleIndex
        }
    }

    /**
     * The mirror of [bottomEdgeIndex]: which reading currently sits at the
     * chat's OLD (top-of-screen) edge. A chat list always shows its oldest
     * content at the visual top regardless of orientation (the two
     * reversals — item order + `reverseLayout` — cancel), so this also
     * doubles as "the topmost visible row" for [PinnedDayHeader]. Feed the
     * result into [isNearOldEnd]'s `edgeIndex` and
     * [PinnedDayHeader.governingDayMillis]'s `topIndex`.
     */
    fun topEdgeIndex(firstVisibleIndex: Int, lastVisibleIndex: Int, orientation: ChatListOrientation): Int {
        return when (orientation) {
            ChatListOrientation.TopDown -> firstVisibleIndex
            ChatListOrientation.BottomUp -> lastVisibleIndex
        }
    }
}
