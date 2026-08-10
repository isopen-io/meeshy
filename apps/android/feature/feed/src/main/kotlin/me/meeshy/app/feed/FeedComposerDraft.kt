package me.meeshy.app.feed

/**
 * The exact payload a publish carries to [FeedViewModel.publishPost] — the pure
 * projection of a ready [FeedComposerDraft]. Text-only for this first sub-slice
 * of the Feed composer (feature-parity §F "Create post"): attachments (photo/
 * camera/file/location/audio) and the language override are a documented,
 * deferred follow-up, matching the routine's own "texte seul d'abord" framing.
 */
data class FeedPostPublishRequest(
    val content: String,
    val visibility: String,
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
 * Pure, immutable model of an in-progress text-only feed post — the Android
 * port of the text-input surface of iOS `FeedView.composerOverlay`'s local
 * `@State` (`composerText` + `postVisibility`). It owns the product rules the
 * Composable must not re-implement:
 *
 * - the **publish gate** (`canPublish`): non-blank trimmed text is required —
 *   this first sub-slice has no attachment escape hatch (iOS also allows
 *   publishing with only a photo/location and no text; deferred here),
 * - the **body actually sent** (`trimmedContent`): whitespace-stripped,
 * - the **visibility** choice (Public/Friends/Private, defaulting Public).
 *
 * The Composable holds one of these in `remember` and stays glue; every
 * decision here is unit-tested.
 */
data class FeedComposerDraft(
    val text: String = "",
    val visibility: FeedPostVisibility = FeedPostVisibility.PUBLIC,
) {
    /** The post body actually published — whitespace-stripped. */
    val trimmedContent: String get() = text.trim()

    /** A post needs at least one non-blank character (text-only: no attachment escape hatch yet). */
    val canPublish: Boolean get() = trimmedContent.isNotEmpty()

    /** Set the text verbatim (no cap — posts have no documented gateway length limit, unlike statuses). */
    fun withText(value: String): FeedComposerDraft = copy(text = value)

    /** Choose the publish audience. */
    fun withVisibility(value: FeedPostVisibility): FeedComposerDraft = copy(visibility = value)

    /** The payload to publish, or `null` when the draft is not yet publishable (blank text). */
    fun publishRequest(): FeedPostPublishRequest? {
        if (!canPublish) return null
        return FeedPostPublishRequest(content = trimmedContent, visibility = visibility.wire)
    }
}
