package me.meeshy.sdk.model

/**
 * Realtime story-edit merge for the TRAY (read side).
 *
 * The gateway broadcasts a `story:updated` as the COMPLETE re-fetched story to every
 * visibility-filtered feed room as ONE object — it cannot be personalized per recipient.
 * Its viewer-specific fields (`isViewedByMe`, `currentUserReactions`, ...) therefore
 * reflect the broadcaster's/default view, not the reader's.
 *
 * Seen state is MONOTONE in the tray ring: once a reader has seen a story its ring stays
 * "seen", even against a laggy broadcast that reports it unseen — EXCEPT when the edit
 * reset engagement server-side ([engagementReset]): a content edit wipes views and
 * reactions, so the ring legitimately reverts to unseen. The AUTHOR is the one exception
 * to that exception: the server never records the author's own view of their own story,
 * so the author's client-only "seen" survives even a reset ([isOwnStory]).
 *
 * Mirror of iOS `StoryViewModel.storyUpdated` (the `story:updated` tray fold) and its
 * `shouldKeepLocalViewed` monotonicity guard — Android carries the explicit
 * `engagementReset` flag on the socket event, so it reads it directly rather than
 * comparing a `contentEditedAt` timestamp the wire model does not expose.
 */
public object StoryUpdateMerge {

    /**
     * Fold the edited [updated] story onto the cached [previous] one for the tray.
     *
     * - `engagementReset && !isOwnStory` → adopt [updated] wholesale: the server wiped the
     *   reader's engagement, so the fresh (unseen) ring is authoritative.
     * - otherwise (a metadata-only edit, or the author's own story) → preserve the reader's
     *   personal state across the swap via [PostUpdateMerge] (monotone seen). Sharing that
     *   one merge keeps the reader-personal-field preservation a single source of truth.
     *
     * Returns `null` — an inert no-op the caller skips without re-persisting — when the
     * merged result is identical to [previous] (a re-broadcast, or an edit that changed
     * nothing the reader can see). Callers match the two by id before calling.
     */
    public fun merge(
        previous: ApiPost,
        updated: ApiPost,
        engagementReset: Boolean,
        isOwnStory: Boolean,
    ): ApiPost? {
        if (engagementReset && !isOwnStory) {
            return updated.takeIf { it != previous }
        }
        return PostUpdateMerge.merge(previous, updated)
    }
}
