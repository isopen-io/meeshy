package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryViewerPosition.GroupShape
import me.meeshy.sdk.model.StoryViewerPosition.Landing
import org.junit.Test

class StoryPlaybackReanchorTest {

    private fun shape(id: String, vararg stories: String) = GroupShape(id, stories.toList())

    private val old = listOf(shape("a", "a1", "a2"), shape("b", "b1", "b2", "b3"))

    @Test
    fun `an insertion before the viewed story does not change the viewed story`() {
        val new = listOf(shape("z", "z1"), shape("a", "a1", "a2"), shape("b", "b0", "b1", "b2", "b3"))
        assertThat(StoryViewerPosition.reanchor(old, new, Landing(1, 1))).isEqualTo(Landing(2, 2))
    }

    @Test
    fun `a sort moves the group but keeps the story`() {
        val new = listOf(shape("b", "b1", "b2", "b3"), shape("a", "a1", "a2"))
        assertThat(StoryViewerPosition.reanchor(old, new, Landing(0, 1))).isEqualTo(Landing(1, 1))
    }

    @Test
    fun `a removed viewed story lands on the one that followed it`() {
        val new = listOf(shape("a", "a1", "a2"), shape("b", "b1", "b3"))
        assertThat(StoryViewerPosition.reanchor(old, new, Landing(1, 1))).isEqualTo(Landing(1, 1))
    }

    @Test
    fun `a removed last story lands on the new last`() {
        val new = listOf(shape("a", "a1", "a2"), shape("b", "b1", "b2"))
        assertThat(StoryViewerPosition.reanchor(old, new, Landing(1, 2))).isEqualTo(Landing(1, 1))
    }

    @Test
    fun `an emptied group lands on the group now at its rank at its first story`() {
        val new = listOf(shape("a", "a1", "a2"), shape("c", "c1", "c2"))
        assertThat(StoryViewerPosition.reanchor(old, new, Landing(1, 2))).isEqualTo(Landing(1, 0))
    }

    @Test
    fun `several groups removed at once clamp instead of overflowing`() {
        val new = listOf(shape("c", "c1"))
        assertThat(StoryViewerPosition.reanchor(old, new, Landing(1, 2))).isEqualTo(Landing(0, 0))
    }

    @Test
    fun `nothing left yields null`() {
        assertThat(StoryViewerPosition.reanchor(old, emptyList(), Landing(0, 0))).isNull()
    }

    @Test
    fun `previous group lands on its last story and clamps a stale index`() {
        assertThat(StoryViewerPosition.previousGroupLanding(listOf(2, 4), fromGroupIndex = 1)).isEqualTo(Landing(0, 1))
        assertThat(StoryViewerPosition.previousGroupLanding(listOf(2, 4), fromGroupIndex = 9)).isEqualTo(Landing(1, 3))
        assertThat(StoryViewerPosition.previousGroupLanding(listOf(2), fromGroupIndex = 0)).isNull()
    }

    @Test
    fun `next group index is bounded by the count`() {
        assertThat(StoryViewerPosition.nextGroupIndex(0, 2)).isEqualTo(1)
        assertThat(StoryViewerPosition.nextGroupIndex(1, 2)).isNull()
    }

    @Test
    fun `the room ledger leaves the room it holds, once`() {
        val (l1, m1) = StoryPostRoomLedger().hold("p1")
        assertThat(m1).isEqualTo(StoryPostRoomLedger.Move(leave = null, join = "p1"))
        val (l2, m2) = l1.hold("p2")
        assertThat(m2).isEqualTo(StoryPostRoomLedger.Move(leave = "p1", join = "p2"))
        assertThat(l2.hold("p2").second).isEqualTo(StoryPostRoomLedger.Move())
        assertThat(l2.hold(null).second).isEqualTo(StoryPostRoomLedger.Move(leave = "p2", join = null))
    }
}
