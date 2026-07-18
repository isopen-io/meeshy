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
    val pendingReplyIds: Set<String> = emptySet(),
) {
    fun isExpanded(id: String): Boolean = id in expandedIds

    fun isLoading(id: String): Boolean = id in loadingIds

    fun isLoaded(id: String): Boolean = id in loadedIds

    /** True while a just-sent reply [id] awaits server confirmation. */
    fun isPendingReply(id: String): Boolean = id in pendingReplyIds

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

    /**
     * Mark every fresh id in [ids] as loading in a single immutable step — the batch primitive
     * behind auto-preloading reply previews. Ids already loading or already loaded are dropped
     * (never refetched); an empty batch is inert. Unlike [beginLoad] this never expands a thread:
     * a preview is *loaded but collapsed*.
     */
    fun beginLoadAll(ids: Collection<String>): CommentRepliesState {
        val fresh = ids.filterNot { it in loadingIds || it in loadedIds }
        if (fresh.isEmpty()) return this
        return copy(loadingIds = loadingIds + fresh)
    }

    /**
     * From the ordered [candidateIds] (the first top-level comments known to have replies), the
     * parent ids to auto-preload: the first [limit], minus any already loaded or in flight. A
     * non-positive [limit] or no fresh candidate ⇒ empty, so the caller skips the preload fetch.
     * Bounding to the first [limit] mirrors iOS `preloadReplyPreviews` (`prefix(5)`), so preview
     * loading stays predictable rather than fanning out across an unbounded comment list.
     */
    fun previewTargets(candidateIds: List<String>, limit: Int): List<String> {
        if (limit <= 0) return emptyList()
        return candidateIds.take(limit).filterNot { it in loadedIds || it in loadingIds }
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

    /**
     * Optimistically prepend a just-sent [reply] under [parentId] and open the thread so the
     * viewer sees it instantly (Instant-App). Deliberately does *not* mark the thread loaded —
     * a later collapse-then-re-expand can still fetch the parent's existing server replies.
     */
    fun optimisticReply(parentId: String, reply: ApiPostComment): CommentRepliesState =
        copy(
            expandedIds = expandedIds + parentId,
            repliesByParent = repliesByParent + (parentId to (listOf(reply) + repliesFor(parentId))),
            pendingReplyIds = pendingReplyIds + reply.id,
        )

    /** Swap the optimistic [tempId] reply under [parentId] for the server row; inert if not pending. */
    fun confirmedReply(parentId: String, tempId: String, confirmed: ApiPostComment): CommentRepliesState {
        if (tempId !in pendingReplyIds) return this
        return copy(
            repliesByParent = repliesByParent +
                (parentId to repliesFor(parentId).map { if (it.id == tempId) confirmed else it }),
            pendingReplyIds = pendingReplyIds - tempId,
        )
    }

    /** Roll back a failed optimistic [tempId] reply under [parentId] — drop the row; inert if not pending. */
    fun failedReply(parentId: String, tempId: String): CommentRepliesState {
        if (tempId !in pendingReplyIds) return this
        return copy(
            repliesByParent = repliesByParent + (parentId to repliesFor(parentId).filterNot { it.id == tempId }),
            pendingReplyIds = pendingReplyIds - tempId,
        )
    }
}
