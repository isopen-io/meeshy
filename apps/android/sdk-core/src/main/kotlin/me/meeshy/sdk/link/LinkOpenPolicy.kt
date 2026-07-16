package me.meeshy.sdk.link

/**
 * How a tapped link should be opened. A pure classification (feature-parity §Chat "in-app browser")
 * consumed by app-side launchers, which map each arm to a concrete Android intent.
 */
public sealed interface LinkOpenTarget {
    /** An http/https URL — open in the in-app browser (Chrome Custom Tab). [url] is normalised. */
    public data class InAppBrowser(val url: String) : LinkOpenTarget

    /** A well-formed non-web scheme (mailto:, tel:, sms:, geo:, meeshy:, deep links…) — hand to the OS. */
    public data class External(val url: String) : LinkOpenTarget

    /** Blank, unparseable, hostless-web, or a dangerous scheme (javascript:, data:, file:…) — do nothing. */
    public data object Unsupported : LinkOpenTarget
}

/**
 * The single pure decision for opening a link. Mirrors iOS, which routes a tapped link to
 * `SFSafariViewController` when `URL(string:)` yields an http(s) URL — but **surpasses** it by:
 *  - blocking dangerous schemes (`javascript:`, `data:`, `file:`…) that a browser must never run,
 *  - routing well-formed non-web schemes (`mailto:`, `tel:`, `meeshy://` deep links) to the OS
 *    instead of silently failing inside a browser sheet, and
 *  - promoting a scheme-less bare host (`example.com`) to `https://` before opening.
 *
 * No Android or platform types leak in; the app-side launcher owns only the intent plumbing.
 */
public object LinkOpenPolicy {

    // RFC-3986 scheme: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) followed by ':'.
    private val schemeRegex = Regex("""^([a-zA-Z][a-zA-Z0-9+.\-]*):""")

    private val webSchemes: Set<String> = setOf("http", "https")

    // Schemes a Custom Tab / browser must never be handed — script/data execution or local file access.
    private val blockedSchemes: Set<String> = setOf(
        "javascript", "data", "file", "about", "blob", "vbscript", "content",
    )

    /** Classifies [rawUrl] into the target that should handle it. */
    public fun targetFor(rawUrl: String): LinkOpenTarget {
        val trimmed = rawUrl.trim()
        if (trimmed.isEmpty()) return LinkOpenTarget.Unsupported

        val schemeMatch = schemeRegex.find(trimmed) ?: return promoteBareHost(trimmed)
        val scheme = schemeMatch.groupValues[1].lowercase()
        return when {
            scheme in blockedSchemes -> LinkOpenTarget.Unsupported
            scheme in webSchemes -> webTarget(scheme, trimmed, schemeMatch.range.last)
            else -> LinkOpenTarget.External(trimmed)
        }
    }

    /** Whether [imageUrl] is a web image safe to hand to an async image loader (http/https only). */
    public fun isRenderableWebImage(imageUrl: String?): Boolean {
        if (imageUrl.isNullOrBlank()) return false
        return targetFor(imageUrl) is LinkOpenTarget.InAppBrowser
    }

    private fun webTarget(scheme: String, url: String, schemeColonIndex: Int): LinkOpenTarget {
        val normalized = scheme + url.substring(schemeColonIndex)
        return if (LinkPreviewParser.hostOf(normalized) != null) {
            LinkOpenTarget.InAppBrowser(normalized)
        } else {
            LinkOpenTarget.Unsupported
        }
    }

    private fun promoteBareHost(candidate: String): LinkOpenTarget {
        if (candidate.any { it.isWhitespace() }) return LinkOpenTarget.Unsupported
        val host = candidate.substringBefore('/').substringBefore('?').substringBefore('#')
        if (!host.contains('.') || host.startsWith('.') || host.endsWith('.')) {
            return LinkOpenTarget.Unsupported
        }
        return LinkOpenTarget.InAppBrowser("https://$candidate")
    }
}
