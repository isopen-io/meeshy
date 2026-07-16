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
 */
data class FeedRealtimeHead(
    val posts: List<ApiPost> = emptyList(),
    val newPostsCount: Int = 0,
) {
    val hasNewPosts: Boolean get() = newPostsCount > 0
}

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
        )
    }

    /**
     * Banner tap / scroll-to-top: reset the count. The posts stay at the head (already
     * shown). Inert when the count is already zero.
     */
    fun acknowledge(state: FeedRealtimeHead): FeedRealtimeHead =
        if (state.newPostsCount == 0) state else state.copy(newPostsCount = 0)

    /**
     * On each cache re-emit, drop buffered posts the refresh has now surfaced ([loadedIds])
     * so they are never rendered twice. The count is untouched — the banner tracks arrivals
     * and is cleared only by [acknowledge] or [clear]. Inert when nothing is dropped.
     */
    fun reconcile(state: FeedRealtimeHead, loadedIds: Set<String>): FeedRealtimeHead {
        if (state.posts.isEmpty()) return state
        val kept = state.posts.filterNot { it.id in loadedIds }
        if (kept.size == state.posts.size) return state
        return state.copy(posts = kept)
    }

    /** Pull-to-refresh: reset the whole head (posts + count). Mirrors iOS `refresh()`. */
    fun clear(state: FeedRealtimeHead): FeedRealtimeHead =
        if (state.posts.isEmpty() && state.newPostsCount == 0) state else FeedRealtimeHead()
}
