package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.ApiPostComment

/**
 * Immutable optimistic-like SSOT for a post's comment thread.
 *
 * Owns three things: the set of comment ids the viewer likes ([likedIds]), an optimistic
 * per-comment count [deltas] applied on top of the server `likeCount`, and an in-flight
 * guard ([inFlightIds]) so a rapid double-tap can't fire two network calls. Every
 * transition is pure — the ViewModel owns *when* to call `likeComment`/`unlikeComment`,
 * this owns *what the like state becomes*. Mirror of iOS
 * `PostDetailViewModel.toggleCommentLike` (heart reaction, optimistic + rollback).
 */
@Immutable
data class CommentLikeState(
    val likedIds: Set<String> = emptySet(),
    val deltas: Map<String, Int> = emptyMap(),
    val inFlightIds: Set<String> = emptySet(),
) {
    fun isLiked(id: String): Boolean = id in likedIds

    fun isInFlight(id: String): Boolean = id in inFlightIds

    /** The count to render: server [baseCount] plus any optimistic delta, never negative. */
    fun displayCount(id: String, baseCount: Int): Int =
        (baseCount + (deltas[id] ?: 0)).coerceAtLeast(0)

    /**
     * Seed liked ids from a fetched page: a comment whose [ApiPostComment.currentUserReactions]
     * contains [heart] is one the viewer already liked server-side. Additive across pages and
     * never overrides a comment the viewer has locally toggled (tracked by a [deltas] entry),
     * so a re-fetch can't resurrect a like the viewer just removed.
     */
    fun seeded(comments: List<ApiPostComment>, heart: String): CommentLikeState {
        val liked = comments
            .filter { it.currentUserReactions?.contains(heart) == true }
            .map { it.id }
            .filter { it !in deltas }
        if (liked.isEmpty()) return this
        return copy(likedIds = likedIds + liked)
    }

    /**
     * Begin an optimistic toggle for [id]: flip the liked flag, adjust the count delta, and mark
     * it in flight. Returns `null` when a toggle for [id] is already in flight (re-entrancy guard),
     * signalling the ViewModel to skip the network call.
     */
    fun beginToggle(id: String): CommentLikeState? {
        if (id in inFlightIds) return null
        return flip(id).copy(inFlightIds = inFlightIds + id)
    }

    /** Confirm the in-flight toggle for [id] — keep the optimistic result, clear the in-flight mark. */
    fun settle(id: String): CommentLikeState =
        if (id in inFlightIds) copy(inFlightIds = inFlightIds - id) else this

    /** Roll back the in-flight toggle for [id] — revert the optimistic flip, clear the in-flight mark. */
    fun rollback(id: String): CommentLikeState =
        if (id in inFlightIds) flip(id).copy(inFlightIds = inFlightIds - id) else this

    private fun flip(id: String): CommentLikeState {
        val nowLiked = id !in likedIds
        return copy(
            likedIds = if (nowLiked) likedIds + id else likedIds - id,
            deltas = deltas + (id to ((deltas[id] ?: 0) + if (nowLiked) 1 else -1)),
        )
    }
}
