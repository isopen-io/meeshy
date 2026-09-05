package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Pure reconciliation coverage for the reels comments sheet's reducer. */
class ReelCommentsReducerTest {

    private fun comment(id: String, createdAt: String? = null, status: ReelCommentStatus = ReelCommentStatus.Sent) =
        ReelCommentPresentation(id = id, authorName = "u-$id", content = "c-$id", createdAt = createdAt, status = status)

    @Test
    fun appendedOlderPage_prependsAnOlderPageAheadOfTheCurrentList() {
        val current = listOf(comment("b", "2026-06-20T11:00:00Z"), comment("c", "2026-06-20T12:00:00Z"))
        val older = listOf(comment("a", "2026-06-20T10:00:00Z"))

        val result = ReelCommentsReducer.appendedOlderPage(current, older)

        assertThat(result.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun appendedOlderPage_dedupesAgainstTheCurrentList() {
        val current = listOf(comment("a", "2026-06-20T10:00:00Z"), comment("b", "2026-06-20T11:00:00Z"))
        val older = listOf(comment("a", "2026-06-20T10:00:00Z"))

        val result = ReelCommentsReducer.appendedOlderPage(current, older)

        assertThat(result.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun appendedOlderPage_sortsTheIncomingPageAscendingAmongItself() {
        val current = listOf(comment("c", "2026-06-20T12:00:00Z"))
        // Server pages arrive newest-first within the page; the reducer must not trust that order.
        val older = listOf(comment("b", "2026-06-20T11:00:00Z"), comment("a", "2026-06-20T10:00:00Z"))

        val result = ReelCommentsReducer.appendedOlderPage(current, older)

        assertThat(result.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun appendedOlderPage_preservesAPendingTailNotPresentInTheOlderPage() {
        val current = listOf(comment("a", "2026-06-20T10:00:00Z"), comment("pending", status = ReelCommentStatus.Pending))
        val older = listOf(comment("older", "2026-06-20T09:00:00Z"))

        val result = ReelCommentsReducer.appendedOlderPage(current, older)

        assertThat(result.map { it.id }).containsExactly("older", "a", "pending").inOrder()
    }

    @Test
    fun merged_stillReplacesTheAcknowledgedSectionWithAFreshFirstPage() {
        val current = listOf(comment("stale-older", "2026-06-20T05:00:00Z"))
        val loaded = listOf(comment("a", "2026-06-20T10:00:00Z"))

        val result = ReelCommentsReducer.merged(current, loaded)

        assertThat(result.map { it.id }).containsExactly("a")
    }
}
