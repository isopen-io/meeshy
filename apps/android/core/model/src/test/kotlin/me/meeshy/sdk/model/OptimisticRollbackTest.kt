package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OptimisticRollbackTest {

    private data class Row(val id: String, val text: String = "")

    private fun rows(vararg ids: String) = ids.map { Row(it) }

    private fun withdraw(id: String, items: List<Row>) = OptimisticRollback.withdrawing(id, items) { it.id }

    private fun restore(item: Row, at: Int, items: List<Row>) = OptimisticRollback.restoring(item, at, items) { it.id }

    @Test
    fun `withdrawing removes only the posted row`() {
        val result = withdraw("cid_1", rows("a", "cid_1", "b"))

        assertThat(result.removed).isTrue()
        assertThat(result.items).isEqualTo(rows("a", "b"))
    }

    @Test
    fun `withdrawing a row already gone changes nothing`() {
        val before = rows("a", "b")

        val result = withdraw("cid_1", before)

        assertThat(result.removed).isFalse()
        assertThat(result.items).isEqualTo(before)
    }

    @Test
    fun `withdrawing keeps messages that arrived and other optimistic sends`() {
        val live = rows("a", "cid_1", "socket_in", "cid_2")

        val result = withdraw("cid_1", live)

        assertThat(result.items.map { it.id }).containsExactly("a", "socket_in", "cid_2").inOrder()
    }

    @Test
    fun `restoring puts the removed row back at its index`() {
        val result = restore(Row("x"), at = 1, items = rows("a", "b"))

        assertThat(result.map { it.id }).containsExactly("a", "x", "b").inOrder()
    }

    @Test
    fun `restoring bounds an index past the end and below zero`() {
        assertThat(restore(Row("x"), at = 99, items = rows("a")).map { it.id }).containsExactly("a", "x").inOrder()
        assertThat(restore(Row("x"), at = -4, items = rows("a")).map { it.id }).containsExactly("x", "a").inOrder()
    }

    @Test
    fun `restoring a row already back does not duplicate it`() {
        val items = rows("a", "x")

        assertThat(restore(Row("x"), at = 0, items = items)).isEqualTo(items)
    }

    @Test
    fun `a gesture rollback leaves the pages and the other gestures untouched`() {
        val afterTwoSends = rows("old", "cid_1", "cid_2", "page2")

        val undone = withdraw("cid_2", afterTwoSends)

        assertThat(undone.items.map { it.id }).containsExactly("old", "cid_1", "page2").inOrder()
    }

    @Test
    fun `decremented follows the removed row and never goes below zero`() {
        assertThat(OptimisticRollback.decremented(3, removed = true)).isEqualTo(2)
        assertThat(OptimisticRollback.decremented(3, removed = false)).isEqualTo(3)
        assertThat(OptimisticRollback.decremented(0, removed = true)).isEqualTo(0)
    }
}
