package me.meeshy.sdk.link

/** Result of an asynchronous link-preview fetch, fed into the pure [LinkPreview] state machine. */
public sealed interface LinkPreviewOutcome {
    /** The fetch has not resolved yet. */
    public data object Pending : LinkPreviewOutcome

    /** The fetch produced renderable OpenGraph metadata. */
    public data class Resolved(val metadata: LinkMetadata) : LinkPreviewOutcome

    /** The fetch failed or returned nothing worth showing (404, non-HTML, empty OG). */
    public data object Empty : LinkPreviewOutcome
}

/**
 * The single presentation state a message's link preview collapses to. Keeping this exhaustive
 * and pure means the Compose card owns no branching — it renders exactly one arm.
 */
public sealed interface LinkPreviewState {
    /** The message carries no link — render nothing. */
    public data object None : LinkPreviewState

    /** A link was detected and its metadata is still loading (show a skeleton chip). */
    public data class Loading(val url: String) : LinkPreviewState

    /** Rich card: title / description / image / site name. */
    public data class Card(val metadata: LinkMetadata) : LinkPreviewState

    /** Fetch yielded nothing — fall back to a bare tappable link chip (never a dead end). */
    public data class BareLink(val url: String) : LinkPreviewState
}

/** Pure decision surface mapping a message body + fetch outcome to a [LinkPreviewState]. */
public object LinkPreview {

    /**
     * Collapses the message [text] and the fetch [outcome] into one [LinkPreviewState]. With no
     * detectable URL the result is always [LinkPreviewState.None], regardless of outcome.
     */
    public fun stateFor(text: String, outcome: LinkPreviewOutcome): LinkPreviewState {
        val url = LinkPreviewParser.firstUrl(text) ?: return LinkPreviewState.None
        return when (outcome) {
            LinkPreviewOutcome.Pending -> LinkPreviewState.Loading(url)
            is LinkPreviewOutcome.Resolved -> LinkPreviewState.Card(outcome.metadata)
            LinkPreviewOutcome.Empty -> LinkPreviewState.BareLink(url)
        }
    }

    /** Whether [text] contains a link worth previewing at all. */
    public fun hasPreview(text: String): Boolean = LinkPreviewParser.firstUrl(text) != null
}
