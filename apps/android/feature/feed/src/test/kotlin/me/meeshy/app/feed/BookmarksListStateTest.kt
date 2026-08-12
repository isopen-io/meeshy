package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import org.junit.Test

class BookmarksListStateTest {

    private fun post(id: String) = ApiPost(id = id, content = "Post $id")

    @Test
    fun `appended onto empty seeds posts, cursor, hasMore and marks loaded`() {
        val state = BookmarksListState.Empty.appended(
            page = listOf(post("a"), post("b")),
            nextCursor = "c1",
            hasMore = true,
        )

        assertThat(state.posts.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(state.cursor).isEqualTo("c1")
        assertThat(state.hasMore).isTrue()
        assertThat(state.hasLoaded).isTrue()
    }

    @Test
    fun `appended de-duplicates a page that re-includes an already-present post`() {
        val first = BookmarksListState.Empty.appended(listOf(post("a"), post("b")), "c1", true)

        val second = first.appended(listOf(post("b"), post("c")), "c2", false)

        assertThat(second.posts.map { it.id }).containsExactly("a", "b", "c").inOrder()
        assertThat(second.cursor).isEqualTo("c2")
        assertThat(second.hasMore).isFalse()
    }

    @Test
    fun `appended preserves existing order and appends only fresh arrivals`() {
        val first = BookmarksListState.Empty.appended(listOf(post("a"), post("b")), "c1", true)

        val second = first.appended(listOf(post("c"), post("d")), null, false)

        assertThat(second.posts.map { it.id }).containsExactly("a", "b", "c", "d").inOrder()
    }

    @Test
    fun `appended empty page still marks loaded and advances the watermark`() {
        val state = BookmarksListState.Empty.appended(emptyList(), nextCursor = null, hasMore = false)

        assertThat(state.posts).isEmpty()
        assertThat(state.hasLoaded).isTrue()
        assertThat(state.cursor).isNull()
        assertThat(state.hasMore).isFalse()
    }

    @Test
    fun `appended fully-duplicate page adds nothing but still advances watermark`() {
        val first = BookmarksListState.Empty.appended(listOf(post("a")), "c1", true)

        val second = first.appended(listOf(post("a")), "c2", true)

        assertThat(second.posts.map { it.id }).containsExactly("a")
        assertThat(second.cursor).isEqualTo("c2")
    }

    @Test
    fun `removed drops the matching post`() {
        val state = BookmarksListState.Empty.appended(listOf(post("a"), post("b"), post("c")), null, false)

        val after = state.removed("b")

        assertThat(after.posts.map { it.id }).containsExactly("a", "c").inOrder()
    }

    @Test
    fun `removed of the sole post empties the list`() {
        val state = BookmarksListState.Empty.appended(listOf(post("a")), null, false)

        assertThat(state.removed("a").posts).isEmpty()
    }

    @Test
    fun `removed of an absent id is inert and returns the same instance`() {
        val state = BookmarksListState.Empty.appended(listOf(post("a")), null, false)

        val after = state.removed("zzz")

        assertThat(after).isSameInstanceAs(state)
    }

    @Test
    fun `canLoadMore is true only when hasMore and a cursor are both present`() {
        val state = BookmarksListState.Empty.appended(listOf(post("a")), "c1", hasMore = true)

        assertThat(state.canLoadMore).isTrue()
    }

    @Test
    fun `canLoadMore is false when the gateway reports no more pages`() {
        val state = BookmarksListState.Empty.appended(listOf(post("a")), "c1", hasMore = false)

        assertThat(state.canLoadMore).isFalse()
    }

    @Test
    fun `canLoadMore is false when there is no cursor even if hasMore is true`() {
        val state = BookmarksListState.Empty.appended(listOf(post("a")), nextCursor = null, hasMore = true)

        assertThat(state.canLoadMore).isFalse()
    }

    @Test
    fun `default state is a cold, unloaded list that reports more available`() {
        val state = BookmarksListState.Empty

        assertThat(state.posts).isEmpty()
        assertThat(state.hasLoaded).isFalse()
        assertThat(state.hasMore).isTrue()
        assertThat(state.canLoadMore).isFalse()
    }
}
