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

    // --- remove (post:deleted) ---

    @Test
    fun `remove tombstones a deleted cache post so the feed can hide it`() {
        val state = FeedRealtimeHead()
        val next = FeedRealtimeReducer.remove(state, postId = "a")

        assertThat(next.removedIds).containsExactly("a")
        assertThat(next.posts).isEmpty()
        assertThat(next.newPostsCount).isEqualTo(0)
    }

    @Test
    fun `remove of a blank id is inert`() {
        val state = FeedRealtimeReducer.remove(FeedRealtimeHead(), "a")
        val next = FeedRealtimeReducer.remove(state, "   ")

        assertThat(next).isSameInstanceAs(state)
    }

    @Test
    fun `remove is idempotent for an already-tombstoned post`() {
        val once = FeedRealtimeReducer.remove(FeedRealtimeHead(), "a")
        val twice = FeedRealtimeReducer.remove(once, "a")

        assertThat(twice).isSameInstanceAs(once)
    }

    @Test
    fun `remove of a buffered head post drops it and decrements the banner count`() {
        val a = FeedRealtimeReducer.accept(FeedRealtimeHead(), post("a"), emptySet())
        val b = FeedRealtimeReducer.accept(a, post("b"), emptySet())
        val next = FeedRealtimeReducer.remove(b, "a")

        assertThat(next.posts.map { it.id }).containsExactly("b")
        assertThat(next.newPostsCount).isEqualTo(1)
        assertThat(next.removedIds).contains("a")
    }

    @Test
    fun `remove never drives the banner count below zero`() {
        val buffered = FeedRealtimeReducer.accept(FeedRealtimeHead(), post("a"), emptySet())
        val acked = FeedRealtimeReducer.acknowledge(buffered)
        val next = FeedRealtimeReducer.remove(acked, "a")

        assertThat(next.newPostsCount).isEqualTo(0)
        assertThat(next.posts).isEmpty()
    }

    @Test
    fun `reconcile keeps a tombstone while the cache still carries the deleted post`() {
        val state = FeedRealtimeReducer.remove(FeedRealtimeHead(), "a")
        val next = FeedRealtimeReducer.reconcile(state, loadedIds = setOf("a"))

        assertThat(next).isSameInstanceAs(state)
        assertThat(next.removedIds).containsExactly("a")
    }

    @Test
    fun `reconcile releases a tombstone once the cache has dropped the deleted post`() {
        val state = FeedRealtimeReducer.remove(FeedRealtimeHead(), "a")
        val next = FeedRealtimeReducer.reconcile(state, loadedIds = setOf("x"))

        assertThat(next.removedIds).isEmpty()
    }

    @Test
    fun `reconcile releases only the tombstones the cache has dropped`() {
        val a = FeedRealtimeReducer.remove(FeedRealtimeHead(), "a")
        val ab = FeedRealtimeReducer.remove(a, "b")
        val next = FeedRealtimeReducer.reconcile(ab, loadedIds = setOf("a"))

        assertThat(next.removedIds).containsExactly("a")
    }

    @Test
    fun `accept of a re-created post clears its tombstone so it renders again`() {
        val tombstoned = FeedRealtimeReducer.remove(FeedRealtimeHead(), "a")
        val next = FeedRealtimeReducer.accept(tombstoned, post("a"), loadedIds = emptySet())

        assertThat(next.posts.map { it.id }).containsExactly("a")
        assertThat(next.removedIds).isEmpty()
        assertThat(next.newPostsCount).isEqualTo(1)
    }

    // --- like (post:liked / post:unliked) ---

    private fun likedPost(id: String, count: Int, mine: Boolean) =
        ApiPost(id = id, content = "Post $id", likeCount = count, isLikedByMe = mine)

    @Test
    fun `like records the gateway's absolute count as an overlay`() {
        val next = FeedRealtimeReducer.like(FeedRealtimeHead(), postId = "a", likesCount = 5, mine = true)

        assertThat(next.likes).containsExactly("a", LikeOverlay(count = 5, mine = true))
    }

    @Test
    fun `like of a blank id is inert`() {
        val state = FeedRealtimeHead()
        val next = FeedRealtimeReducer.like(state, postId = "   ", likesCount = 3, mine = true)

        assertThat(next).isSameInstanceAs(state)
    }

    @Test
    fun `like with a repeated identical overlay is inert`() {
        val once = FeedRealtimeReducer.like(FeedRealtimeHead(), "a", likesCount = 5, mine = true)
        val twice = FeedRealtimeReducer.like(once, "a", likesCount = 5, mine = true)

        assertThat(twice).isSameInstanceAs(once)
    }

    @Test
    fun `like updates the absolute count on a fresh broadcast`() {
        val once = FeedRealtimeReducer.like(FeedRealtimeHead(), "a", likesCount = 5, mine = true)
        val next = FeedRealtimeReducer.like(once, "a", likesCount = 8, mine = true)

        assertThat(next.likes["a"]).isEqualTo(LikeOverlay(count = 8, mine = true))
    }

    @Test
    fun `unlike overlays a false viewer-own state`() {
        val next = FeedRealtimeReducer.like(FeedRealtimeHead(), "a", likesCount = 4, mine = false)

        assertThat(next.likes["a"]).isEqualTo(LikeOverlay(count = 4, mine = false))
    }

    @Test
    fun `like by another user moves the count but preserves a prior viewer-own like`() {
        val own = FeedRealtimeReducer.like(FeedRealtimeHead(), "a", likesCount = 5, mine = true)
        val other = FeedRealtimeReducer.like(own, "a", likesCount = 6, mine = null)

        assertThat(other.likes["a"]).isEqualTo(LikeOverlay(count = 6, mine = true))
    }

    @Test
    fun `like by another user with no prior overlay leaves the viewer-own state unknown`() {
        val next = FeedRealtimeReducer.like(FeedRealtimeHead(), "a", likesCount = 3, mine = null)

        assertThat(next.likes["a"]).isEqualTo(LikeOverlay(count = 3, mine = null))
    }

    // --- reconcileLikes ---

    @Test
    fun `reconcileLikes on an empty overlay map is inert`() {
        val state = FeedRealtimeHead()
        val next = FeedRealtimeReducer.reconcileLikes(state, cachePosts = listOf(likedPost("a", 5, true)))

        assertThat(next).isSameInstanceAs(state)
    }

    @Test
    fun `reconcileLikes releases an overlay the cache has caught up to`() {
        val state = FeedRealtimeReducer.like(FeedRealtimeHead(), "a", likesCount = 5, mine = true)
        val next = FeedRealtimeReducer.reconcileLikes(state, listOf(likedPost("a", count = 5, mine = true)))

        assertThat(next.likes).isEmpty()
    }

    @Test
    fun `reconcileLikes keeps an overlay whose count the cache has not caught up to`() {
        val state = FeedRealtimeReducer.like(FeedRealtimeHead(), "a", likesCount = 5, mine = true)
        val next = FeedRealtimeReducer.reconcileLikes(state, listOf(likedPost("a", count = 3, mine = true)))

        assertThat(next).isSameInstanceAs(state)
        assertThat(next.likes["a"]).isEqualTo(LikeOverlay(count = 5, mine = true))
    }

    @Test
    fun `reconcileLikes keeps an overlay for a post still absent from the cache`() {
        val state = FeedRealtimeReducer.like(FeedRealtimeHead(), "a", likesCount = 5, mine = null)
        val next = FeedRealtimeReducer.reconcileLikes(state, cachePosts = emptyList())

        assertThat(next).isSameInstanceAs(state)
    }

    @Test
    fun `reconcileLikes ignores the viewer-own state when the overlay claims none`() {
        val state = FeedRealtimeReducer.like(FeedRealtimeHead(), "a", likesCount = 5, mine = null)
        val next = FeedRealtimeReducer.reconcileLikes(state, listOf(likedPost("a", count = 5, mine = false)))

        assertThat(next.likes).isEmpty()
    }

    @Test
    fun `reconcileLikes keeps an overlay whose viewer-own state the cache has not caught up to`() {
        val state = FeedRealtimeReducer.like(FeedRealtimeHead(), "a", likesCount = 5, mine = true)
        val next = FeedRealtimeReducer.reconcileLikes(state, listOf(likedPost("a", count = 5, mine = false)))

        assertThat(next.likes["a"]).isEqualTo(LikeOverlay(count = 5, mine = true))
    }

    @Test
    fun `reconcileLikes releases only the overlays the cache has caught up to`() {
        val a = FeedRealtimeReducer.like(FeedRealtimeHead(), "a", likesCount = 5, mine = true)
        val ab = FeedRealtimeReducer.like(a, "b", likesCount = 9, mine = null)
        val next = FeedRealtimeReducer.reconcileLikes(
            ab,
            listOf(likedPost("a", count = 5, mine = true), likedPost("b", count = 2, mine = false)),
        )

        assertThat(next.likes.keys).containsExactly("b")
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
    fun `clear also releases every tombstone`() {
        val removed = FeedRealtimeReducer.remove(FeedRealtimeHead(), "a")
        val next = FeedRealtimeReducer.clear(removed)

        assertThat(next.removedIds).isEmpty()
        assertThat(next).isEqualTo(FeedRealtimeHead())
    }

    @Test
    fun `clear also drops every live like overlay`() {
        val overlaid = FeedRealtimeReducer.like(FeedRealtimeHead(), "a", likesCount = 5, mine = true)
        val next = FeedRealtimeReducer.clear(overlaid)

        assertThat(next.likes).isEmpty()
        assertThat(next).isEqualTo(FeedRealtimeHead())
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
