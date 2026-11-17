package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sync.RecentWindowPrune.Held
import me.meeshy.sdk.model.sync.RecentWindowPrune.Served
import org.junit.Test

/**
 * #19046 — what a recent-window page may declare gone by its absence. The gateway orders by `(createdAt desc, id desc)`
 * and cuts at its limit: only what ranks above that cut, and was held BEFORE the request, can be missing from it.
 */
class RecentWindowPruneTest {

    private fun held(id: String, at: Long, serverId: String? = null) = Held(id, serverId, at)

    private fun served(id: String, at: Long?, cid: String? = null) = Served(id, cid, at)

    @Test
    fun `a held row the page no longer serves, above its cut, is gone`() {
        val gone = RecentWindowPrune.gone(
            held = listOf(held("a1", 10), held("a2", 20)),
            heldBefore = setOf("a1", "a2"),
            page = listOf(served("a1", 10)),
        )

        assertThat(gone).containsExactly("a2")
    }

    /** F2 — two messages of the same millisecond, the limit cut the lower id: it is alive, and keeps its row. */
    @Test
    fun `a row of the same millisecond as the oldest served, with a lower id, may be the one the limit cut`() {
        val gone = RecentWindowPrune.gone(
            held = listOf(held("aa01", 10), held("aa02", 10), held("aa03", 20)),
            heldBefore = setOf("aa01", "aa02", "aa03"),
            page = listOf(served("aa03", 20), served("aa02", 10)),
        )

        assertThat(gone).isEmpty()
    }

    @Test
    fun `a row of the same millisecond with a higher id ranks above the cut, and its absence is a deletion`() {
        val gone = RecentWindowPrune.gone(
            held = listOf(held("aa02", 10), held("aa05", 10), held("aa09", 20)),
            heldBefore = setOf("aa02", "aa05", "aa09"),
            page = listOf(served("aa09", 20), served("aa02", 10)),
        )

        assertThat(gone).containsExactly("aa05")
    }

    @Test
    fun `the rank of a reconciled bubble is its server id, not its local key`() {
        val gone = RecentWindowPrune.gone(
            held = listOf(held("cid_z", 10, serverId = "aa01"), held("aa03", 20)),
            heldBefore = setOf("cid_z", "aa03"),
            page = listOf(served("aa03", 20), served("aa02", 10)),
        )

        assertThat(gone).isEmpty()
    }

    /** F3 — a row written during the flight is unknown to the page, whatever its instant: dated ahead or not. */
    @Test
    fun `a row written while the page was in flight is never gone, even dated ahead of everything held`() {
        val gone = RecentWindowPrune.gone(
            held = listOf(held("a1", 10), held("arrived", 15), held("ahead", 99_999)),
            heldBefore = setOf("a1"),
            page = listOf(served("a1", 10)),
        )

        assertThat(gone).isEmpty()
    }

    @Test
    fun `a row the page serves under its client id is not gone`() {
        val gone = RecentWindowPrune.gone(
            held = listOf(held("cid_1", 20)),
            heldBefore = setOf("cid_1"),
            page = listOf(served("m1", 20, cid = "cid_1"), served("a0", 5)),
        )

        assertThat(gone).isEmpty()
    }

    @Test
    fun `an empty page declares every row held before it gone`() {
        val gone = RecentWindowPrune.gone(
            held = listOf(held("a1", 10), held("arrived", 20)),
            heldBefore = setOf("a1"),
            page = emptyList(),
        )

        assertThat(gone).containsExactly("a1")
    }

    @Test
    fun `an unreadable served instant proves nothing, and nothing is gone`() {
        val gone = RecentWindowPrune.gone(
            held = listOf(held("a1", 10), held("a2", 20)),
            heldBefore = setOf("a1", "a2"),
            page = listOf(served("a3", null), served("a4", 30)),
        )

        assertThat(gone).isEmpty()
    }

    @Test
    fun `a row older than the page is outside what it covers`() {
        val gone = RecentWindowPrune.gone(
            held = listOf(held("old", 5), held("a1", 10)),
            heldBefore = setOf("old", "a1"),
            page = listOf(served("a1", 10)),
        )

        assertThat(gone).isEmpty()
    }
}
