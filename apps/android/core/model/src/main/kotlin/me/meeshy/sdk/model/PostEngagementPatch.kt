package me.meeshy.sdk.model

/**
 * #18931 — a live gesture on a post, as EVERY cached copy of it takes it (iOS
 * `CacheCoordinator.subscribeToPostEngagement`): the gateway's ABSOLUTE counts, never a sum of local deltas, so two
 * surfaces can never drift apart. `null`: the copy already says it, nothing to write.
 */
object PostEngagementPatch {

    /** `post:liked` / `post:unliked` — the heart follows only the viewer's own gesture ([mine]); anyone's moves the count. */
    fun liked(post: ApiPost, likeCount: Int, mine: Boolean?): ApiPost? =
        post.copy(likeCount = likeCount.coerceAtLeast(0), isLikedByMe = mine ?: post.isLikedByMe).takeUnless { it == post }

    /** `comment:added` / `comment:deleted` — the post's ABSOLUTE comment count. */
    fun commented(post: ApiPost, commentCount: Int): ApiPost? =
        post.copy(commentCount = commentCount.coerceAtLeast(0)).takeUnless { it == post }

    /** `post:bookmarked` — personal to the viewer: the saved state and the ABSOLUTE bookmark count the gateway served. */
    fun bookmarked(post: ApiPost, bookmarked: Boolean, bookmarkCount: Int): ApiPost? =
        post.copy(isBookmarkedByMe = bookmarked, bookmarkCount = bookmarkCount.coerceAtLeast(0)).takeUnless { it == post }
}
