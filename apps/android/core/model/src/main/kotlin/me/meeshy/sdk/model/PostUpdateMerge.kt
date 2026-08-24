package me.meeshy.sdk.model

/**
 * Realtime post-edit merge for the feed (read side).
 *
 * The gateway's `post:updated` broadcast carries the whole re-fetched post to every
 * feed/post room as ONE object — it cannot be personalized per recipient. Its
 * viewer-specific fields therefore reflect the broadcaster's/default view, not the
 * reader's: adopting them wholesale would silently un-like, un-bookmark, un-view or
 * drop the reader's own reactions on the card the instant an unrelated edit lands.
 *
 * This adopts every AUTHORITATIVE field from the edited post (content, counts,
 * translations, reaction summary, media, ...) while carrying the reader's own
 * PERSONAL state across the swap. iOS preserves only `isLiked`; Android's model
 * exposes four viewer-owned fields, so all four are preserved here — strictly more
 * faithful than the iOS mirror.
 */
public object PostUpdateMerge {

    /**
     * Fold the edited [updated] post onto the cached [previous] one, preserving the
     * reader's own [ApiPost.isLikedByMe] / [ApiPost.isBookmarkedByMe] /
     * [ApiPost.isViewedByMe] / [ApiPost.currentUserReactions]. Callers match the two by
     * id before calling; the merge itself is id-agnostic.
     *
     * Returns `null` — an inert no-op the caller can skip without re-emitting — when the
     * merged result is identical to [previous] (a re-broadcast, or an edit that changed
     * nothing the reader can see). Otherwise the returned copy carries the edit.
     */
    public fun merge(previous: ApiPost, updated: ApiPost): ApiPost? {
        val merged = updated.copy(
            isLikedByMe = previous.isLikedByMe,
            isBookmarkedByMe = previous.isBookmarkedByMe,
            isViewedByMe = previous.isViewedByMe,
            currentUserReactions = previous.currentUserReactions,
        )
        return merged.takeIf { it != previous }
    }
}
