package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentRepliesPagerTest {

    private fun reply(id: String) = ApiPostComment(id = id, parentId = "root")
    private fun page(range: IntRange) = range.map { reply("r$it") }

    @Test
    fun `a full page of 20 leaves more to load with the last id as cursor`() {
        val pager = CommentRepliesPager().loaded("root", page(1..20))

        assertThat(pager.hasMore("root")).isTrue()
        assertThat(pager.nextCursor("root")).isEqualTo("r20")
        assertThat(pager.repliesFor("root")).hasSize(20)
    }

    @Test
    fun `a short page ends the thread`() {
        val pager = CommentRepliesPager().loaded("root", page(1..7))

        assertThat(pager.hasMore("root")).isFalse()
        assertThat(pager.nextCursor("root")).isNull()
    }

    @Test
    fun `the next page appends without duplicating`() {
        val pager = CommentRepliesPager().loaded("root", page(1..20)).loaded("root", page(20..25))

        assertThat(pager.repliesFor("root").map { it.id }).containsExactlyElementsIn((1..25).map { "r$it" }).inOrder()
        assertThat(pager.hasMore("root")).isFalse()
    }

    @Test
    fun `a load in flight blocks a second one and a failure frees it`() {
        val loading = CommentRepliesPager().loaded("root", page(1..20)).beginLoadMore("root")!!

        assertThat(loading.isLoadingMore("root")).isTrue()
        assertThat(loading.beginLoadMore("root")).isNull()
        assertThat(loading.failedMore("root").beginLoadMore("root")).isNotNull()
    }

    @Test
    fun `nothing to load more when the thread is exhausted or unknown`() {
        assertThat(CommentRepliesPager().beginLoadMore("root")).isNull()
        assertThat(CommentRepliesPager().loaded("root", page(1..3)).beginLoadMore("root")).isNull()
    }

    @Test
    fun `remaining count follows the server reply count`() {
        val pager = CommentRepliesPager().loaded("root", page(1..20))
        assertThat(pager.remaining("root", totalReplyCount = 45)).isEqualTo(25)
        assertThat(pager.remaining("root", totalReplyCount = 10)).isEqualTo(0)
    }
}
