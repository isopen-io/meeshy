package me.meeshy.sdk.link

/**
 * Metadata extracted from a URL's OpenGraph / Twitter-card / HTML-fallback headers.
 *
 * A pure value type (feature-parity §Chat "OpenGraph link-preview cards"). It mirrors iOS's
 * `LinkMetadata` but drops the fetch timestamp — retention/TTL is an app-side persistence
 * concern, not part of the stateless parsing building block. [id] is the canonical URL and
 * doubles as the cache key.
 */
public data class LinkMetadata(
    val id: String,
    val title: String? = null,
    val description: String? = null,
    val imageUrl: String? = null,
    val siteName: String? = null,
) {
    /** Host of the canonical [id], or `null` when [id] is not an absolute URL. */
    val host: String?
        get() = LinkPreviewParser.hostOf(id)

    /**
     * Whether the card has anything worth rendering beyond the bare link. A host-derived
     * [siteName] alone does not count — it is always present and would defeat the "fall back
     * to the raw link" rule, exactly as iOS's `hasAnyVisibleField`.
     */
    val hasAnyVisibleField: Boolean
        get() = !title.isNullOrBlank() || !description.isNullOrBlank() || !imageUrl.isNullOrBlank()
}
