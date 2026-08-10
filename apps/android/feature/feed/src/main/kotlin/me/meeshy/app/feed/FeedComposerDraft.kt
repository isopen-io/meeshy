package me.meeshy.app.feed

/**
 * The exact payload a publish carries to [FeedViewModel.publishPost] — the pure
 * projection of a ready [FeedComposerDraft]. Port of iOS `FeedView.composerOverlay`'s
 * `composerText` + [visibility] + `pendingAttachments`: [mediaIds] carries the
 * already-uploaded photo/video attachments (the "photo/caméra d'abord" fast-follow
 * to the text-only first sub-slice). Camera capture, file, location and audio
 * attachments plus the per-post language override remain a documented, deferred
 * follow-up.
 */
data class FeedPostPublishRequest(
    val content: String,
    val visibility: String,
    val mediaIds: List<String> = emptyList(),
)

/**
 * Audience a feed post is visible to — mirrors the gateway `Visibility` enum
 * carried on the post create request. [wire] is the exact string the API
 * expects; the UI never hardcodes the literal. Port of iOS composer's
 * `postVisibility` Menu (`Public`/`Amis`/`Prive`) — a strict subset of
 * [StatusVisibility] (no `COMMUNITY` case; posts have no community audience yet).
 */
enum class FeedPostVisibility(val wire: String) {
    PUBLIC("PUBLIC"),
    FRIENDS("FRIENDS"),
    PRIVATE("PRIVATE"),
}

/**
 * Pure, immutable model of an in-progress feed post — the Android port of the
 * composer surface of iOS `FeedView.composerOverlay`'s local `@State`
 * (`composerText` + `postVisibility` + `pendingAttachments`). It owns the
 * product rules the Composable must not re-implement:
 *
 * - the **publish gate** (`canPublish`): non-blank trimmed text **or** at least
 *   one attached media (mirror of iOS's `!composerText...isEmpty ||
 *   !pendingAttachments.isEmpty`) — a post is never entirely empty,
 * - the **body actually sent** (`trimmedContent`): whitespace-stripped,
 * - the **visibility** choice (Public/Friends/Private, defaulting Public),
 * - the **attached media** ([mediaIds]): already-uploaded ids, capped at
 *   [MAX_MEDIA] (parity with the story composer's own ≤10 rule).
 *
 * The Composable holds one of these in `remember` and stays glue; every
 * decision here is unit-tested. Upload orchestration itself (calling the
 * network, tracking an in-flight spinner) is not this class's concern — it
 * only ever receives already-uploaded ids via [withMedia].
 */
data class FeedComposerDraft(
    val text: String = "",
    val visibility: FeedPostVisibility = FeedPostVisibility.PUBLIC,
    val mediaIds: List<String> = emptyList(),
) {
    /** The post body actually published — whitespace-stripped. */
    val trimmedContent: String get() = text.trim()

    /** A post needs non-blank text or at least one attached media — never neither. */
    val canPublish: Boolean get() = trimmedContent.isNotEmpty() || mediaIds.isNotEmpty()

    /** Free attachment slots left before [MAX_MEDIA] is reached (never negative). */
    val remainingMediaSlots: Int get() = (MAX_MEDIA - mediaIds.size).coerceAtLeast(0)

    /** Whether the media allowance is already exhausted. */
    val isMediaFull: Boolean get() = mediaIds.size >= MAX_MEDIA

    /** Set the text verbatim (no cap — posts have no documented gateway length limit, unlike statuses). */
    fun withText(value: String): FeedComposerDraft = copy(text = value)

    /** Choose the publish audience. */
    fun withVisibility(value: FeedPostVisibility): FeedComposerDraft = copy(visibility = value)

    /**
     * Appends freshly-uploaded media [ids], capped at [MAX_MEDIA] so a caller
     * that ignores [remainingMediaSlots] can never overshoot the allowance.
     * Accumulates across multiple picks (does not replace the existing list).
     */
    fun withMedia(ids: List<String>): FeedComposerDraft = copy(mediaIds = (mediaIds + ids).take(MAX_MEDIA))

    /** Removes one attached media by [id]; removing an unknown id is inert. */
    fun withoutMedia(id: String): FeedComposerDraft = copy(mediaIds = mediaIds.filterNot { it == id })

    /** The payload to publish, or `null` when the draft is not yet publishable (see [canPublish]). */
    fun publishRequest(): FeedPostPublishRequest? {
        if (!canPublish) return null
        return FeedPostPublishRequest(content = trimmedContent, visibility = visibility.wire, mediaIds = mediaIds)
    }

    companion object {
        /** Parity with the story composer's own ≤10 media-per-item rule. */
        const val MAX_MEDIA: Int = 10
    }
}
