package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.ApiPostComment

/**
 * Immutable SSOT for the 1-level reply threads under a post's top-level comments.
 *
 * Keyed by the parent comment id: which threads the viewer has [expandedIds] open, the
 * [loadingIds] currently fetching, the [loadedIds] fetched at least once (so a
 * collapse-then-re-expand never refetches), and the [repliesByParent] rows themselves.
 * Every transition is pure — the ViewModel owns *when* to call `getCommentReplies`, this
 * owns *what the reply state becomes*. Mirror of iOS `PostDetailViewModel` thread
 * management (`expandedThreads` / `repliesMap` / `loadingReplies`), collapsing the thread
 * on a load failure exactly as iOS does.
 */
@Immutable
data class CommentRepliesState(
    val expandedIds: Set<String> = emptySet(),
    val loadingIds: Set<String> = emptySet(),
    val loadedIds: Set<String> = emptySet(),
    val repliesByParent: Map<String, List<ApiPostComment>> = emptyMap(),
) {
    fun isExpanded(id: String): Boolean = id in expandedIds

    fun isLoading(id: String): Boolean = id in loadingIds

    fun isLoaded(id: String): Boolean = id in loadedIds

    fun repliesFor(id: String): List<ApiPostComment> = repliesByParent[id] ?: emptyList()

    /** Open the thread [id]; inert if already open. */
    fun expanded(id: String): CommentRepliesState =
        if (id in expandedIds) this else copy(expandedIds = expandedIds + id)

    /** Close the thread [id]; inert if not open. */
    fun collapsed(id: String): CommentRepliesState =
        if (id in expandedIds) copy(expandedIds = expandedIds - id) else this

    /**
     * Begin loading the replies for [id]. Returns `null` when a load is already in flight
     * *or* the thread was already loaded once — signalling the ViewModel to skip the fetch.
     */
    fun beginLoad(id: String): CommentRepliesState? {
        if (id in loadingIds || id in loadedIds) return null
        return copy(loadingIds = loadingIds + id)
    }

    /** Store the fetched [replies] for [id], mark it loaded, and clear the loading mark. */
    fun loaded(id: String, replies: List<ApiPostComment>): CommentRepliesState =
        copy(
            loadingIds = loadingIds - id,
            loadedIds = loadedIds + id,
            repliesByParent = repliesByParent + (id to replies),
        )

    /** Roll back a failed load for [id] — clear the loading mark and collapse the thread. */
    fun failed(id: String): CommentRepliesState =
        copy(loadingIds = loadingIds - id, expandedIds = expandedIds - id)
}
