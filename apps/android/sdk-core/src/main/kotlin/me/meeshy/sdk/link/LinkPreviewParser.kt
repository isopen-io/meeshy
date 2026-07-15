package me.meeshy.sdk.link

/**
 * Pure, stateless building blocks for OpenGraph link previews (feature-parity §Chat). Faithful
 * JVM port of iOS's `LinkPreviewFetcher` *pure* surface — URL detection, tracker-param
 * canonicalisation, OpenGraph/meta HTML parsing and HTML-entity decoding — with the network and
 * cache orchestration deliberately left to app-side glue. Everything here is deterministic and
 * fully unit-testable; no Android or platform types leak in.
 */
public object LinkPreviewParser {

    private val trackerParams: Set<String> = setOf(
        "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid",
    )

    // A candidate is an explicit http(s) URL or a bare `www.` host, grabbed up to the next
    // whitespace; trailing sentence punctuation is stripped afterwards by [trimTrailing].
    private val candidateRegex = Regex("""(?i)(?:https?://|www\.)\S+""")
    private val schemePrefix = Regex("""^(https?)://""", RegexOption.IGNORE_CASE)
    private val numericEntity = Regex("""&#(?:x([0-9a-fA-F]+)|([0-9]+));""", RegexOption.IGNORE_CASE)

    private val trailingPunctuation: Set<Char> = ".,;:!?\"'…".toSet()
    private val closers: Map<Char, Char> = mapOf(')' to '(', ']' to '[', '}' to '{')

    private val namedEntities: Map<String, String> = mapOf(
        "&amp;" to "&",
        "&lt;" to "<",
        "&gt;" to ">",
        "&quot;" to "\"",
        "&apos;" to "'",
        "&#39;" to "'",
        "&nbsp;" to " ",
        "&mdash;" to "—",
        "&ndash;" to "–",
        "&hellip;" to "…",
    )

    // MARK: - URL detection

    /**
     * The first HTTP(S) URL in [text], normalised (scheme lowercased, bare `www.` promoted to
     * `https://`) and with trailing sentence punctuation trimmed. Returns `null` when the text
     * carries no http/www link (mailto/tel and other schemes are ignored).
     */
    public fun firstUrl(text: String): String? {
        if (text.isBlank()) return null
        for (match in candidateRegex.findAll(text)) {
            val normalized = normalizeCandidate(match.value)
            if (normalized != null) return normalized
        }
        return null
    }

    private fun normalizeCandidate(raw: String): String? {
        val trimmed = trimTrailing(raw)
        if (trimmed.isEmpty()) return null

        val scheme = schemePrefix.find(trimmed)
        if (scheme != null) {
            val rest = trimmed.substring(scheme.range.last + 1)
            if (rest.isEmpty()) return null
            return "${scheme.groupValues[1].lowercase()}://$rest"
        }
        if (trimmed.startsWith("www.", ignoreCase = true)) {
            if (trimmed.length <= 4) return null
            return "https://$trimmed"
        }
        return null
    }

    private fun trimTrailing(url: String): String {
        var s = url
        while (s.isNotEmpty()) {
            val c = s.last()
            when {
                c in trailingPunctuation || c == '>' -> s = s.dropLast(1)
                c in closers -> {
                    val open = closers.getValue(c)
                    if (s.count { it == c } > s.count { it == open }) s = s.dropLast(1) else break
                }
                else -> break
            }
        }
        return s
    }

    // MARK: - Canonicalisation (tracker stripping)

    /**
     * Strips known tracking params (utm_*, fbclid, gclid — matched case-insensitively) and an
     * empty `#` fragment, so the same shared link keys one cache entry regardless of campaign
     * tags. Non-tracker params keep their original order; an unparseable value is returned as-is.
     */
    public fun canonicalize(url: String): String {
        val hashIdx = url.indexOf('#')
        val beforeFragment = if (hashIdx >= 0) url.substring(0, hashIdx) else url
        val fragment = if (hashIdx >= 0) url.substring(hashIdx + 1) else null

        val queryIdx = beforeFragment.indexOf('?')
        val base = if (queryIdx >= 0) beforeFragment.substring(0, queryIdx) else beforeFragment
        val query = if (queryIdx >= 0) beforeFragment.substring(queryIdx + 1) else null

        val keptQuery = query
            ?.split('&')
            ?.filter { it.isNotEmpty() && it.substringBefore('=').lowercase() !in trackerParams }
            ?.joinToString("&")

        return buildString {
            append(base)
            if (!keptQuery.isNullOrEmpty()) append('?').append(keptQuery)
            if (!fragment.isNullOrEmpty()) append('#').append(fragment)
        }
    }

    // MARK: - HTML metadata parsing

    /**
     * Parses OpenGraph / Twitter-card / HTML-fallback metadata out of [html] for the page at
     * [url]. Title falls back to the `<title>` tag, site name to the URL host; image URLs are
     * resolved against the page. Fields are HTML-entity decoded. Always returns a value — call
     * [LinkMetadata.hasAnyVisibleField] to decide whether the card is worth showing.
     */
    public fun parse(html: String, url: String): LinkMetadata {
        val title = (firstMeta(html, listOf("og:title", "twitter:title")) ?: firstTitleTag(html))
            ?.let(::decodeHtmlEntities)
        val description = firstMeta(html, listOf("og:description", "twitter:description", "description"))
            ?.let(::decodeHtmlEntities)
        val image = firstMeta(html, listOf("og:image", "twitter:image", "twitter:image:src"))
            ?.let { resolveImageUrl(it, url) }
        val siteName = (firstMeta(html, listOf("og:site_name", "application-name"))?.let(::decodeHtmlEntities))
            ?: hostOf(url)

        return LinkMetadata(
            id = url,
            title = title,
            description = description,
            imageUrl = image,
            siteName = siteName,
        )
    }

    private fun firstMeta(html: String, properties: List<String>): String? {
        for (prop in properties) {
            val escaped = Regex.escape(prop)
            val patterns = listOf(
                """<meta[^>]+property=['"]$escaped['"][^>]+content=['"]([^'"]+)['"]""",
                """<meta[^>]+content=['"]([^'"]+)['"][^>]+property=['"]$escaped['"]""",
                """<meta[^>]+name=['"]$escaped['"][^>]+content=['"]([^'"]+)['"]""",
                """<meta[^>]+content=['"]([^'"]+)['"][^>]+name=['"]$escaped['"]""",
            )
            for (pattern in patterns) {
                val value = Regex(pattern, setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
                    .find(html)?.groupValues?.getOrNull(1)
                if (!value.isNullOrEmpty()) return value
            }
        }
        return null
    }

    private fun firstTitleTag(html: String): String? =
        Regex("""<title[^>]*>([^<]+)</title>""", RegexOption.IGNORE_CASE)
            .find(html)?.groupValues?.getOrNull(1)

    private fun resolveImageUrl(candidate: String, base: String): String? {
        val trimmed = candidate.trim()
        if (trimmed.isEmpty()) return null
        if (Regex("""^[a-zA-Z][a-zA-Z0-9+.\-]*://""").containsMatchIn(trimmed)) return trimmed
        if (trimmed.startsWith("//")) {
            val scheme = base.substringBefore("://", missingDelimiterValue = "https")
            return "$scheme:$trimmed"
        }
        val origin = originOf(base) ?: return trimmed
        if (trimmed.startsWith("/")) return "$origin$trimmed"
        val directory = pathOf(base).substringBeforeLast('/', missingDelimiterValue = "")
        return "$origin$directory/$trimmed"
    }

    // MARK: - HTML entity decoding

    /**
     * Decodes the high-value named HTML entities plus decimal (`&#169;`) and hex (`&#x00AE;`)
     * numeric entities, then trims surrounding whitespace. Unknown entities are left intact.
     */
    public fun decodeHtmlEntities(input: String): String {
        var value = input
        for ((entity, replacement) in namedEntities) {
            value = value.replace(entity, replacement)
        }
        value = numericEntity.replace(value) { match ->
            val hex = match.groupValues[1]
            val codePoint = if (hex.isNotEmpty()) hex.toIntOrNull(16) else match.groupValues[2].toIntOrNull()
            if (codePoint != null && codePoint in 0..0x10FFFF) {
                runCatching { String(Character.toChars(codePoint)) }.getOrDefault(match.value)
            } else {
                match.value
            }
        }
        return value.trim()
    }

    // MARK: - URL component helpers

    /** Host of an absolute URL string (userinfo/port stripped), or `null` when there is no scheme. */
    public fun hostOf(url: String): String? {
        val schemeSep = url.indexOf("://")
        if (schemeSep < 0) return null
        val authority = url.substring(schemeSep + 3)
            .substringBefore('/')
            .substringBefore('?')
            .substringBefore('#')
            .substringAfterLast('@')
            .substringBefore(':')
        return authority.ifEmpty { null }
    }

    private fun originOf(url: String): String? {
        val schemeSep = url.indexOf("://")
        if (schemeSep < 0) return null
        val scheme = url.substring(0, schemeSep)
        val authority = url.substring(schemeSep + 3)
            .substringBefore('/')
            .substringBefore('?')
            .substringBefore('#')
        return if (authority.isEmpty()) null else "$scheme://$authority"
    }

    private fun pathOf(url: String): String {
        val schemeSep = url.indexOf("://")
        val rest = if (schemeSep >= 0) url.substring(schemeSep + 3) else url
        val afterAuthority = rest.substringBefore('?').substringBefore('#')
        val slash = afterAuthority.indexOf('/')
        return if (slash >= 0) afterAuthority.substring(slash) else ""
    }
}
