package me.meeshy.app.feed

/**
 * Resolve a possibly-relative media path against the gateway origin — one law shared
 * across the feed module's projections (posts, repost embeds, comments) so a stored
 * `/uploads/…` path and an absolute `https://…` URL are handled identically everywhere.
 *
 * - An already-absolute `http(s)` URL is returned unchanged.
 * - With no base, the raw path is returned as-is (nothing to resolve against).
 * - Otherwise the base origin (trailing slash trimmed) is joined to the path,
 *   inserting exactly one `/`.
 */
internal fun resolveFeedMediaUrl(url: String, mediaBaseUrl: String?): String = when {
    url.startsWith("http") -> url
    mediaBaseUrl == null -> url
    else -> mediaBaseUrl.trimEnd('/') + (if (url.startsWith("/")) url else "/$url")
}
