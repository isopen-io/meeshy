package me.meeshy.sdk.model

/**
 * Pure presentation helpers for a [MyShareLink] — faithful ports of the iOS
 * computed properties (`ShareLinkModels.swift`). Kept framework-free so every
 * branch is JVM-testable and the screen stays a thin renderer.
 */

/**
 * The label shown for a link — the name, else the human identifier, else the raw
 * public [MyShareLink.linkId]. Port of iOS `displayName = name ?? identifier ?? linkId`,
 * hardened so a blank (not just null) name/identifier falls through rather than
 * rendering an empty row.
 */
public val MyShareLink.displayName: String
    get() = name?.takeIf { it.isNotBlank() }
        ?: identifier?.takeIf { it.isNotBlank() }
        ?: linkId

/**
 * The public, shareable join URL — `{webOrigin}/join/{identifier ?? linkId}`. Port
 * of iOS `joinUrl`. A trailing slash on [webOrigin] is dropped so the path never
 * doubles up; a blank identifier falls through to the raw [MyShareLink.linkId].
 */
public fun MyShareLink.joinUrl(webOrigin: String): String {
    val base = webOrigin.trimEnd('/')
    val slug = identifier?.takeIf { it.isNotBlank() } ?: linkId
    return "$base/join/$slug"
}
