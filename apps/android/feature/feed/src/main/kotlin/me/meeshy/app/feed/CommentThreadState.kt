package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostTranslationEntry

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

    /**
     * A live `comment:added` top-level comment from another user (the post-detail realtime room):
     * prepend it (newest on top, mirror of iOS inserting at index 0), deduped by id and **not**
     * marked pending — it is already a confirmed server row. Inert (same instance) when a comment
     * with that id is already present (the viewer's own confirmed echo, or a duplicate broadcast).
     */
    fun received(comment: ApiPostComment): CommentThreadState {
        if (comments.any { it.id == comment.id }) return this
        return copy(comments = listOf(comment) + comments)
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
     * Remove a top-level comment [id] deleted elsewhere (a live `comment:deleted` for the open
     * post): drop the row and any pending mark it carried. Unlike [failed] this works for any
     * present row, not only pending ones. Inert (same instance) when no comment matches [id] —
     * the deleted id may be a reply (handled by [CommentRepliesState]) or on an unloaded page.
     * Mirror of iOS `PostDetailViewModel` removing the comment from `comments` on `comment:deleted`.
     */
    fun removed(id: String): CommentThreadState {
        if (comments.none { it.id == id }) return this
        return copy(comments = comments.filterNot { it.id == id }, pendingIds = pendingIds - id)
    }

    /**
     * Apply a freshly-merged on-demand translation to a top-level comment [commentId]:
     * replace only its [ApiPostComment.translations] — every other field (notably
     * `replyCount`, which a live reply may bump while the translation is in flight) is
     * left untouched — so the projection can re-render it in the newly-available language.
     * Inert (same instance) when no top-level comment matches [commentId] (it may be a
     * reply, handled by [CommentRepliesState.retranslated], or on an unloaded page).
     */
    fun retranslated(
        commentId: String,
        translations: Map<String, ApiPostTranslationEntry>?,
    ): CommentThreadState {
        if (comments.none { it.id == commentId }) return this
        return copy(
            comments = comments.map {
                if (it.id == commentId) it.copy(translations = translations) else it
            },
        )
    }

    /**
     * Replace a top-level comment edited elsewhere (a live `comment:updated` for the open post):
     * swap the whole row for the server-authoritative [comment] in place, preserving its position.
     * Unlike [retranslated] (which touches only `translations`) this adopts every field — content,
     * effects, translations, counts — because the payload carries the COMPLETE new comment (mirror
     * of iOS `applyCommentEdit`, which replaces the row wholesale). The heart state lives in a
     * separate [CommentLikeState] keyed by id, so a full-row swap never disturbs the viewer's like.
     * Inert (same instance) when no top-level comment matches (it may be a reply, handled by
     * [CommentRepliesState.replacedReply], or on an unloaded page).
     */
    fun replaced(comment: ApiPostComment): CommentThreadState {
        if (comments.none { it.id == comment.id }) return this
        return copy(comments = comments.map { if (it.id == comment.id) comment else it })
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
