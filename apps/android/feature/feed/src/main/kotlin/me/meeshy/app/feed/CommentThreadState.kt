package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.ApiPostComment

/**
 * Immutable accumulation SSOT for a post's comment thread.
 *
 * Fetched pages fold in newest-first with de-dup by id and a watermark advance; a
 * just-sent comment is prepended optimistically (my own, on top) and tracked in
 * [pendingIds] until the server either confirms it (swap for the real row) or the
 * send fails (roll it back). Every transition is pure — the ViewModel owns "when",
 * this owns "what the list becomes".
 */
@Immutable
data class CommentThreadState(
    val comments: List<ApiPostComment> = emptyList(),
    val pendingIds: Set<String> = emptySet(),
    val cursor: String? = null,
    val hasMore: Boolean = false,
    val hasLoaded: Boolean = false,
) {
    val isEmpty: Boolean get() = comments.isEmpty()

    /** True only when there is a next page *and* a cursor to fetch it with. */
    val canLoadMore: Boolean get() = hasMore && !cursor.isNullOrBlank()

    /** Fold a fetched page: append rows unseen by id, advance the watermark, mark loaded. */
    fun appended(page: List<ApiPostComment>, nextCursor: String?, more: Boolean): CommentThreadState {
        val known = comments.mapTo(HashSet()) { it.id }
        val fresh = page.filter { it.id !in known }
        return copy(
            comments = comments + fresh,
            cursor = nextCursor,
            hasMore = more,
            hasLoaded = true,
        )
    }

    /** Optimistically prepend a just-sent [comment]; inert if its id is already present. */
    fun optimistic(comment: ApiPostComment): CommentThreadState {
        if (comments.any { it.id == comment.id }) return this
        return copy(comments = listOf(comment) + comments, pendingIds = pendingIds + comment.id)
    }

    /** Replace the optimistic [tempId] with the server [confirmed] row; inert if not pending. */
    fun confirmed(tempId: String, confirmed: ApiPostComment): CommentThreadState {
        if (tempId !in pendingIds) return this
        return copy(
            comments = comments.map { if (it.id == tempId) confirmed else it },
            pendingIds = pendingIds - tempId,
        )
    }

    /** Roll back a failed optimistic [tempId] — drop the row and its pending mark; inert if absent. */
    fun failed(tempId: String): CommentThreadState {
        if (tempId !in pendingIds) return this
        return copy(comments = comments.filterNot { it.id == tempId }, pendingIds = pendingIds - tempId)
    }

    /**
     * Optimistically shift the [parentId] comment's `replyCount` by [delta] (a null count reads
     * as zero, clamped ≥ 0) so the "View N replies" affordance tracks a just-sent reply. Inert
     * when no comment matches [parentId].
     */
    fun bumpReplyCount(parentId: String, delta: Int): CommentThreadState {
        if (comments.none { it.id == parentId }) return this
        return copy(
            comments = comments.map {
                if (it.id == parentId) it.copy(replyCount = ((it.replyCount ?: 0) + delta).coerceAtLeast(0)) else it
            },
        )
    }
}
