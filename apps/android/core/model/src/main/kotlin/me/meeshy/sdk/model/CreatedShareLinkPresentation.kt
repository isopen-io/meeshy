package me.meeshy.sdk.model

/**
 * Pure presentation helpers for a freshly [CreatedShareLink] — the label and the
 * public join URL surfaced on the creation-success sheet. Kept framework-free so
 * every branch is JVM-testable and the success sheet stays a thin renderer.
 */

/**
 * The label shown for the freshly created link — its [CreatedShareLink.name], else
 * the raw public [CreatedShareLink.linkId]. Hardened so a blank (not just null)
 * name falls through rather than rendering an empty title.
 */
public val CreatedShareLink.displayName: String
    get() = name?.takeIf { it.isNotBlank() } ?: linkId

/**
 * The public, shareable URL — `{webOrigin}/chat/{linkId}`, the canonical
 * share page (`/join` only survives as a 308 redirect for links already in
 * the wild — a fresh link never takes the detour). Mirrors
 * [MyShareLink.joinUrl]: a trailing slash on [webOrigin] is dropped so the path
 * never doubles up. The gateway sets [CreatedShareLink.linkId] to the custom
 * identifier when one was requested, so this is the same slug the owner chose.
 */
public fun CreatedShareLink.joinUrl(webOrigin: String): String {
    val base = webOrigin.trimEnd('/')
    return "$base/chat/$linkId"
}
