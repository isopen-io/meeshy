package me.meeshy.app.feed

import me.meeshy.sdk.model.ApiPost

/**
 * The feed's real-time head: socket-arrived posts (`post:created`) that sit above the
 * cache-projected feed, plus the "new posts" banner count. Android analogue of iOS
 * [FeedViewModel] `post:created` handling + `mergePreservingRealtimeHead` + `newPostsCount`.
 *
 * [posts] are newest-first and are prepended to the feed the user sees. [newPostsCount]
 * counts arrivals since the last acknowledge/refresh — it is deliberately **not**
 * `posts.size`: acknowledging (scroll-to-top) clears the count while the posts stay at
 * the head, exactly like iOS `acknowledgeNewPosts()`.
 *
 * [removedIds] are posts a live `post:deleted` has retired: the feed hides them from
 * both the head and the cache-projected list until a background refresh drops them from
 * the cache, at which point [FeedRealtimeReducer.reconcile] releases the tombstone.
 * Android analogue of iOS FeedViewModel removing the post from its in-memory array.
 *
 * [likes] are live like-count overrides keyed by post id: a `post:liked` / `post:unliked`
 * broadcast carries the gateway's ABSOLUTE count, which wins over the (possibly stale)
 * cache count until a background refresh catches up — at which point
 * [FeedRealtimeReducer.reconcileLikes] releases the overlay. Android analogue of iOS
 * FeedViewModel setting `post.likes = data.likeCount` on the two socket streams.
 */
data class FeedRealtimeHead(
    val posts: List<ApiPost> = emptyList(),
    val newPostsCount: Int = 0,
    val removedIds: Set<String> = emptySet(),
    val likes: Map<String, LikeOverlay> = emptyMap(),
) {
    val hasNewPosts: Boolean get() = newPostsCount > 0
}

/**
 * A live like override for a post: the gateway's absolute [count] plus [mine] — whether
 * the *viewer's own* like flipped (a socket event carrying the viewer's own userId) or
 * `null` when it was another user's action and the viewer's own `isLiked` must defer to
 * the cache (or a prior own-action overlay). Mirrors the iOS rule that only sets
 * `isLiked` when `data.userId == currentUser.id`, while the count is always absolute.
 */
data class LikeOverlay(val count: Int, val mine: Boolean?)

/**
 * Pure transitions over [FeedRealtimeHead]. Every transition returns the *same instance*
 * when nothing changes, so a `StateFlow` skips redundant emissions.
 */
object FeedRealtimeReducer {

    /**
     * A socket `post:created` arrived. Ignores a blank id, a post already visible in the
     * cache-projected feed ([loadedIds]) — the offline-echo / duplicate case iOS guards
     * with `!posts.contains` — and a post already buffered. A genuinely new post is
     * prepended (newest-first) and bumps the banner count.
     */
    fun accept(
        state: FeedRealtimeHead,
        post: ApiPost,
        loadedIds: Set<String>,
    ): FeedRealtimeHead {
        val id = post.id
        if (id.isBlank()) return state
        if (id in loadedIds) return state
        if (state.posts.any { it.id == id }) return state
        return state.copy(
            posts = listOf(post) + state.posts,
            newPostsCount = state.newPostsCount + 1,
            removedIds = if (id in state.removedIds) state.removedIds - id else state.removedIds,
        )
    }

    /**
     * A socket `post:deleted` arrived. Tombstones the id so the feed hides it, drops it
     * from the buffered head if it was a still-unseen arrival (decrementing the banner
     * count — never below zero — so the banner never claims a post that is gone), and is
     * inert for a blank id or a post already tombstoned and absent from the head.
     */
    fun remove(state: FeedRealtimeHead, postId: String): FeedRealtimeHead {
        if (postId.isBlank()) return state
        val inHead = state.posts.any { it.id == postId }
        if (!inHead && postId in state.removedIds) return state
        return state.copy(
            posts = if (inHead) state.posts.filterNot { it.id == postId } else state.posts,
            newPostsCount = if (inHead) maxOf(0, state.newPostsCount - 1) else state.newPostsCount,
            removedIds = state.removedIds + postId,
        )
    }

    /**
     * A socket `post:liked` / `post:unliked` arrived. [likesCount] is the gateway's
     * ABSOLUTE like count (source of truth for the displayed count — never a delta) and
     * [mine] is `true`/`false` when the event is the viewer's own like/unlike, or `null`
     * when it is another user's action: the count still moves, but the viewer's own
     * `isLiked` defers to the cache or a prior own-action overlay ([mine] is preserved).
     * Inert for a blank id or when the resulting overlay equals the current one (same
     * instance → `StateFlow` dedup).
     */
    fun like(
        state: FeedRealtimeHead,
        postId: String,
        likesCount: Int,
        mine: Boolean?,
    ): FeedRealtimeHead {
        if (postId.isBlank()) return state
        val existing = state.likes[postId]
        val overlay = LikeOverlay(count = likesCount, mine = mine ?: existing?.mine)
        if (existing == overlay) return state
        return state.copy(likes = state.likes + (postId to overlay))
    }

    /**
     * On each cache re-emit, release like overlays the cache has caught up to: a post the
     * cache now carries with a matching absolute count (and, when the overlay claims a
     * viewer-own state, a matching `isLikedByMe`). Overlays for posts still absent from the
     * cache (a realtime-head arrival, or a not-yet-refreshed post) are kept so a live count
     * is never reverted to a stale cache value. Inert when nothing changes.
     */
    fun reconcileLikes(state: FeedRealtimeHead, cachePosts: List<ApiPost>): FeedRealtimeHead {
        if (state.likes.isEmpty()) return state
        val byId = cachePosts.associateBy { it.id }
        val kept = state.likes.filterNot { (id, overlay) ->
            val post = byId[id] ?: return@filterNot false
            val countCaughtUp = (post.likeCount ?: 0) == overlay.count
            val mineCaughtUp = overlay.mine == null || (post.isLikedByMe == true) == overlay.mine
            countCaughtUp && mineCaughtUp
        }
        if (kept.size == state.likes.size) return state
        return state.copy(likes = kept)
    }

    /**
     * Banner tap / scroll-to-top: reset the count. The posts stay at the head (already
     * shown). Inert when the count is already zero.
     */
    fun acknowledge(state: FeedRealtimeHead): FeedRealtimeHead =
        if (state.newPostsCount == 0) state else state.copy(newPostsCount = 0)

    /**
     * On each cache re-emit, drop buffered posts the refresh has now surfaced ([loadedIds])
     * so they are never rendered twice, and release tombstones the cache no longer carries
     * (a `post:deleted` the refresh has already applied). The count is untouched — the banner
     * tracks arrivals and is cleared only by [acknowledge] or [clear]. Inert when nothing changes.
     */
    fun reconcile(state: FeedRealtimeHead, loadedIds: Set<String>): FeedRealtimeHead {
        val keptPosts = state.posts.filterNot { it.id in loadedIds }
        val keptRemoved = state.removedIds.filterTo(HashSet()) { it in loadedIds }
        val postsChanged = keptPosts.size != state.posts.size
        val removedChanged = keptRemoved.size != state.removedIds.size
        if (!postsChanged && !removedChanged) return state
        return state.copy(
            posts = if (postsChanged) keptPosts else state.posts,
            removedIds = if (removedChanged) keptRemoved else state.removedIds,
        )
    }

    /** Pull-to-refresh: reset the whole head (posts + count + tombstones). Mirrors iOS `refresh()`. */
    fun clear(state: FeedRealtimeHead): FeedRealtimeHead =
        if (state == FeedRealtimeHead()) state else FeedRealtimeHead()
}
