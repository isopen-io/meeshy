package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import org.junit.Test

/**
 * Behavioural spec for the feed real-time head (socket `post:created` buffer +
 * "new posts" banner count). Mirrors iOS FeedViewModel `post:created` handling +
 * `mergePreservingRealtimeHead` + `newPostsCount`.
 */
class FeedRealtimeReducerTest {

    private fun post(id: String) = ApiPost(id = id, content = "Post $id")

    // --- accept ---

    @Test
    fun `accept buffers a fresh post at the head and bumps the banner count`() {
        val next = FeedRealtimeReducer.accept(FeedRealtimeHead(), post("a"), loadedIds = emptySet())

        assertThat(next.posts.map { it.id }).containsExactly("a")
        assertThat(next.newPostsCount).isEqualTo(1)
        assertThat(next.hasNewPosts).isTrue()
    }

    @Test
    fun `accept prepends newest-first so the latest arrival heads the buffer`() {
        val afterFirst = FeedRealtimeReducer.accept(FeedRealtimeHead(), post("a"), emptySet())
        val afterSecond = FeedRealtimeReducer.accept(afterFirst, post("b"), emptySet())

        assertThat(afterSecond.posts.map { it.id }).containsExactly("b", "a").inOrder()
        assertThat(afterSecond.newPostsCount).isEqualTo(2)
    }

    @Test
    fun `accept ignores a post whose id is a blank string`() {
        val state = FeedRealtimeHead()
        val next = FeedRealtimeReducer.accept(state, post("   "), emptySet())

        assertThat(next).isSameInstanceAs(state)
    }

    @Test
    fun `accept ignores a post already present in the cache-projected feed`() {
        val state = FeedRealtimeHead()
        val next = FeedRealtimeReducer.accept(state, post("a"), loadedIds = setOf("a"))

        assertThat(next).isSameInstanceAs(state)
        assertThat(next.newPostsCount).isEqualTo(0)
    }

    @Test
    fun `accept ignores a post already buffered so a duplicate socket echo is inert`() {
        val once = FeedRealtimeReducer.accept(FeedRealtimeHead(), post("a"), emptySet())
        val twice = FeedRealtimeReducer.accept(once, post("a"), emptySet())

        assertThat(twice).isSameInstanceAs(once)
        assertThat(twice.newPostsCount).isEqualTo(1)
    }

    // --- acknowledge ---

    @Test
    fun `acknowledge clears the count but keeps the buffered posts at the head`() {
        val buffered = FeedRealtimeReducer.accept(FeedRealtimeHead(), post("a"), emptySet())
        val acked = FeedRealtimeReducer.acknowledge(buffered)

        assertThat(acked.newPostsCount).isEqualTo(0)
        assertThat(acked.hasNewPosts).isFalse()
        assertThat(acked.posts.map { it.id }).containsExactly("a")
    }

    @Test
    fun `acknowledge on an already-empty count is inert`() {
        val state = FeedRealtimeHead()
        val acked = FeedRealtimeReducer.acknowledge(state)

        assertThat(acked).isSameInstanceAs(state)
    }

    // --- reconcile ---

    @Test
    fun `reconcile on an empty buffer is inert`() {
        val state = FeedRealtimeHead()
        val next = FeedRealtimeReducer.reconcile(state, loadedIds = setOf("a", "b"))

        assertThat(next).isSameInstanceAs(state)
    }

    @Test
    fun `reconcile keeps posts still absent from the cache`() {
        val state = FeedRealtimeReducer.accept(FeedRealtimeHead(), post("a"), emptySet())
        val next = FeedRealtimeReducer.reconcile(state, loadedIds = setOf("x", "y"))

        assertThat(next).isSameInstanceAs(state)
    }

    @Test
    fun `reconcile drops posts the cache refresh has now surfaced but leaves the count`() {
        val a = FeedRealtimeReducer.accept(FeedRealtimeHead(), post("a"), emptySet())
        val b = FeedRealtimeReducer.accept(a, post("b"), emptySet())
        val next = FeedRealtimeReducer.reconcile(b, loadedIds = setOf("a"))

        assertThat(next.posts.map { it.id }).containsExactly("b")
        assertThat(next.newPostsCount).isEqualTo(2)
    }

    @Test
    fun `reconcile can drain the whole buffer once the cache catches up`() {
        val a = FeedRealtimeReducer.accept(FeedRealtimeHead(), post("a"), emptySet())
        val next = FeedRealtimeReducer.reconcile(a, loadedIds = setOf("a"))

        assertThat(next.posts).isEmpty()
        assertThat(next.newPostsCount).isEqualTo(1)
    }

    // --- clear ---

    @Test
    fun `clear resets a populated head to empty`() {
        val a = FeedRealtimeReducer.accept(FeedRealtimeHead(), post("a"), emptySet())
        val next = FeedRealtimeReducer.clear(a)

        assertThat(next.posts).isEmpty()
        assertThat(next.newPostsCount).isEqualTo(0)
    }

    @Test
    fun `clear on an already-empty head is inert`() {
        val state = FeedRealtimeHead()
        val next = FeedRealtimeReducer.clear(state)

        assertThat(next).isSameInstanceAs(state)
    }

    @Test
    fun `clear resets a head that was acknowledged but still buffers posts`() {
        val buffered = FeedRealtimeReducer.accept(FeedRealtimeHead(), post("a"), emptySet())
        val acked = FeedRealtimeReducer.acknowledge(buffered)
        val next = FeedRealtimeReducer.clear(acked)

        assertThat(next.posts).isEmpty()
        assertThat(next.newPostsCount).isEqualTo(0)
    }
}
