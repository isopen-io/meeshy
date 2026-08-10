package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ChatScrollGeometryTest {

    // -- bottomIndex ---------------------------------------------------

    @Test
    fun `bottomIndex is the last row in TopDown`() {
        assertThat(ChatScrollGeometry.bottomIndex(4, ChatListOrientation.TopDown)).isEqualTo(4)
    }

    @Test
    fun `bottomIndex is row zero in BottomUp`() {
        assertThat(ChatScrollGeometry.bottomIndex(4, ChatListOrientation.BottomUp)).isEqualTo(0)
    }

    @Test
    fun `bottomIndex on a single-row list is row zero in both orientations`() {
        assertThat(ChatScrollGeometry.bottomIndex(0, ChatListOrientation.TopDown)).isEqualTo(0)
        assertThat(ChatScrollGeometry.bottomIndex(0, ChatListOrientation.BottomUp)).isEqualTo(0)
    }

    @Test
    fun `bottomIndex on an empty list stays -1 in both orientations`() {
        assertThat(ChatScrollGeometry.bottomIndex(-1, ChatListOrientation.TopDown)).isEqualTo(-1)
        assertThat(ChatScrollGeometry.bottomIndex(-1, ChatListOrientation.BottomUp)).isEqualTo(-1)
    }

    // -- isNearBottom ----------------------------------------------------

    @Test
    fun `TopDown -- the last visible row exactly at the end is near bottom`() {
        assertThat(ChatScrollGeometry.isNearBottom(9, 9, ChatListOrientation.TopDown)).isTrue()
    }

    @Test
    fun `TopDown -- within tolerance of the end is near bottom`() {
        // lastIndex=9, tolerance=2 -> row 7 still counts.
        assertThat(ChatScrollGeometry.isNearBottom(7, 9, ChatListOrientation.TopDown)).isTrue()
    }

    @Test
    fun `TopDown -- just past tolerance is not near bottom`() {
        assertThat(ChatScrollGeometry.isNearBottom(6, 9, ChatListOrientation.TopDown)).isFalse()
    }

    @Test
    fun `TopDown -- a reader scrolled into history is not near bottom`() {
        assertThat(ChatScrollGeometry.isNearBottom(0, 9, ChatListOrientation.TopDown)).isFalse()
    }

    @Test
    fun `BottomUp -- the first visible row exactly at index 0 is near bottom`() {
        assertThat(ChatScrollGeometry.isNearBottom(0, 9, ChatListOrientation.BottomUp)).isTrue()
    }

    @Test
    fun `BottomUp -- within tolerance of index 0 is near bottom`() {
        assertThat(ChatScrollGeometry.isNearBottom(2, 9, ChatListOrientation.BottomUp)).isTrue()
    }

    @Test
    fun `BottomUp -- just past tolerance is not near bottom`() {
        assertThat(ChatScrollGeometry.isNearBottom(3, 9, ChatListOrientation.BottomUp)).isFalse()
    }

    @Test
    fun `an empty or single-row list is always near bottom in both orientations`() {
        assertThat(ChatScrollGeometry.isNearBottom(0, -1, ChatListOrientation.TopDown)).isTrue()
        assertThat(ChatScrollGeometry.isNearBottom(0, 0, ChatListOrientation.TopDown)).isTrue()
        assertThat(ChatScrollGeometry.isNearBottom(0, -1, ChatListOrientation.BottomUp)).isTrue()
        assertThat(ChatScrollGeometry.isNearBottom(0, 0, ChatListOrientation.BottomUp)).isTrue()
    }

    // -- isNearOldEnd ------------------------------------------------------

    @Test
    fun `TopDown -- index zero is near the old end`() {
        assertThat(ChatScrollGeometry.isNearOldEnd(0, 20, ChatListOrientation.TopDown)).isTrue()
    }

    @Test
    fun `TopDown -- within threshold of index zero is near the old end`() {
        assertThat(ChatScrollGeometry.isNearOldEnd(2, 20, ChatListOrientation.TopDown)).isTrue()
    }

    @Test
    fun `TopDown -- just past the threshold is not near the old end`() {
        assertThat(ChatScrollGeometry.isNearOldEnd(3, 20, ChatListOrientation.TopDown)).isFalse()
    }

    @Test
    fun `BottomUp -- the last row is near the old end`() {
        assertThat(ChatScrollGeometry.isNearOldEnd(20, 20, ChatListOrientation.BottomUp)).isTrue()
    }

    @Test
    fun `BottomUp -- within threshold of the last row is near the old end`() {
        assertThat(ChatScrollGeometry.isNearOldEnd(18, 20, ChatListOrientation.BottomUp)).isTrue()
    }

    @Test
    fun `BottomUp -- just past the threshold is not near the old end`() {
        assertThat(ChatScrollGeometry.isNearOldEnd(17, 20, ChatListOrientation.BottomUp)).isFalse()
    }

    // -- bottomEdgeIndex / topEdgeIndex -----------------------------------
    //
    // A real `LazyListState` exposes two Compose-native readings —
    // `firstVisibleItemIndex` (lowest visible index) and the derived
    // `lastVisibleItemIndex` (highest visible index) — that never change
    // meaning themselves, but which one answers "the bottom edge" / "the old
    // (top) edge" flips with `reverseLayout`. These two functions are the
    // single place that translates Compose's own first/last into the chat's
    // semantic bottom/old-end edges, so [ChatScreen] never repeats the branch.

    @Test
    fun `TopDown -- the bottom edge is the highest visible index`() {
        assertThat(ChatScrollGeometry.bottomEdgeIndex(2, 9, ChatListOrientation.TopDown)).isEqualTo(9)
    }

    @Test
    fun `BottomUp -- the bottom edge is the lowest visible index`() {
        assertThat(ChatScrollGeometry.bottomEdgeIndex(2, 9, ChatListOrientation.BottomUp)).isEqualTo(2)
    }

    @Test
    fun `TopDown -- the old (top) edge is the lowest visible index`() {
        assertThat(ChatScrollGeometry.topEdgeIndex(2, 9, ChatListOrientation.TopDown)).isEqualTo(2)
    }

    @Test
    fun `BottomUp -- the old (top) edge is the highest visible index`() {
        assertThat(ChatScrollGeometry.topEdgeIndex(2, 9, ChatListOrientation.BottomUp)).isEqualTo(9)
    }
}
