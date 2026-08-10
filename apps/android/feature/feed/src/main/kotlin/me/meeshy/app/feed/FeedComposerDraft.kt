package me.meeshy.app.feed

import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.ReelComposition
import me.meeshy.sdk.model.UploadedMedia

/**
 * The exact payload a publish carries to [FeedViewModel.publishPost] — the pure
 * projection of a ready [FeedComposerDraft]. Port of iOS `FeedView.composerOverlay`'s
 * `composerText` + [visibility] + `pendingAttachments`: [mediaIds] carries the
 * already-uploaded photo/video attachments (the "photo/caméra d'abord" fast-follow
 * to the text-only first sub-slice) and [type] the resolved wire post type
 * (`"POST"`/`"REEL"` — see [FeedComposerDraft.postType]/[ReelComposition]). Camera
 * capture, file, location and audio attachments plus the per-post language override
 * remain a documented, deferred follow-up.
 */
data class FeedPostPublishRequest(
    val content: String,
    val visibility: String,
    val mediaIds: List<String> = emptyList(),
    val type: String = PostType.POST.name,
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
 * (`composerText` + `postVisibility` + `pendingAttachments` +
 * `composerForcePlainPost`). It owns the product rules the Composable must not
 * re-implement:
 *
 * - the **publish gate** (`canPublish`): non-blank trimmed text **or** at least
 *   one attached media (mirror of iOS's `!composerText...isEmpty ||
 *   !pendingAttachments.isEmpty`) — a post is never entirely empty,
 * - the **body actually sent** (`trimmedContent`): whitespace-stripped,
 * - the **visibility** choice (Public/Friends/Private, defaulting Public),
 * - the **attached media** ([media]): already-uploaded items, capped at
 *   [MAX_MEDIA] (parity with the story composer's own ≤10 rule),
 * - the **reel classification** ([postType]): [ReelComposition.defaultType]
 *   applied to the attached media's MIME types/durations — a qualifying
 *   composition (video/audio ≥3s, or ≥2 images) defaults to `REEL` unless the
 *   author overrides it via [forcePlainPost] (mirror of iOS's Réel⇄Post
 *   toggle, `FeedView.composerForcePlainPost`).
 *
 * The Composable holds one of these in `remember` and stays glue; every
 * decision here is unit-tested. Upload orchestration itself (calling the
 * network, tracking an in-flight spinner) is not this class's concern — it
 * only ever receives already-uploaded [UploadedMedia] via [withMedia], which
 * already carries the `mimeType`/`durationMs` the gateway resolved during the
 * TUS upload (no on-device metadata extraction needed — the same wire shape
 * `MediaAttachmentWire` surfaces for any upload path).
 */
data class FeedComposerDraft(
    val text: String = "",
    val visibility: FeedPostVisibility = FeedPostVisibility.PUBLIC,
    val media: List<UploadedMedia> = emptyList(),
    val forcePlainPost: Boolean = false,
) {
    /** The post body actually published — whitespace-stripped. */
    val trimmedContent: String get() = text.trim()

    /** A post needs non-blank text or at least one attached media — never neither. */
    val canPublish: Boolean get() = trimmedContent.isNotEmpty() || media.isNotEmpty()

    /** The ids referenced by [FeedPostPublishRequest.mediaIds] — a projection of [media]. */
    val mediaIds: List<String> get() = media.map { it.id }

    /** Free attachment slots left before [MAX_MEDIA] is reached (never negative). */
    val remainingMediaSlots: Int get() = (MAX_MEDIA - media.size).coerceAtLeast(0)

    /** Whether the media allowance is already exhausted. */
    val isMediaFull: Boolean get() = media.size >= MAX_MEDIA

    /**
     * `true` when the current [media] composition qualifies as a reel
     * ([ReelComposition.qualifiesAsReel]) — drives whether the Composable
     * shows the Réel⇄Post override toggle at all (removing an image down to
     * one, for instance, both de-qualifies AND hides the toggle, mirroring
     * iOS exactly).
     */
    val qualifiesAsReel: Boolean get() = ReelComposition.qualifiesAsReel(mediaKinds())

    /**
     * The [PostType] this draft will publish as: `REEL` when [qualifiesAsReel]
     * and the author hasn't set [forcePlainPost], otherwise `POST`.
     */
    val postType: PostType get() = ReelComposition.defaultType(mediaKinds(), forcePlainPost)

    private fun mediaKinds(): List<ReelComposition.MediaKind> =
        media.map { ReelComposition.MediaKind(mimeType = it.mimeType, durationMs = it.durationMs) }

    /** Set the text verbatim (no cap — posts have no documented gateway length limit, unlike statuses). */
    fun withText(value: String): FeedComposerDraft = copy(text = value)

    /** Choose the publish audience. */
    fun withVisibility(value: FeedPostVisibility): FeedComposerDraft = copy(visibility = value)

    /**
     * Appends freshly-uploaded [items], capped at [MAX_MEDIA] so a caller that
     * ignores [remainingMediaSlots] can never overshoot the allowance.
     * Accumulates across multiple picks (does not replace the existing list).
     */
    fun withMedia(items: List<UploadedMedia>): FeedComposerDraft = copy(media = (media + items).take(MAX_MEDIA))

    /** Removes one attached media by [id]; removing an unknown id is inert. */
    fun withoutMedia(id: String): FeedComposerDraft = copy(media = media.filterNot { it.id == id })

    /**
     * Sets the author's override of the reel default (mirrors iOS
     * `composerForcePlainPost.toggle()`). Has no effect on [postType] unless
     * [qualifiesAsReel] — forcing plain-post on a non-qualifying composition
     * is already a no-op, exactly like iOS's toggle being hidden in that case.
     */
    fun withForcePlainPost(value: Boolean): FeedComposerDraft = copy(forcePlainPost = value)

    /** The payload to publish, or `null` when the draft is not yet publishable (see [canPublish]). */
    fun publishRequest(): FeedPostPublishRequest? {
        if (!canPublish) return null
        return FeedPostPublishRequest(
            content = trimmedContent,
            visibility = visibility.wire,
            mediaIds = mediaIds,
            type = postType.name,
        )
    }

    companion object {
        /** Parity with the story composer's own ≤10 media-per-item rule. */
        const val MAX_MEDIA: Int = 10
    }
}
