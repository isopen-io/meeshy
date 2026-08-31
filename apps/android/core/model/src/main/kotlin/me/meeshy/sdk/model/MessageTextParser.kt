package me.meeshy.sdk.model

import me.meeshy.sdk.model.search.SearchTextFolder

/**
 * The four inline emphasis treatments a text run can carry. Immutable; markdown
 * nesting unions them (e.g. `**a *b* c**` → the `b` run is bold + italic).
 */
data class TextStyles(
    val bold: Boolean = false,
    val italic: Boolean = false,
    val strikethrough: Boolean = false,
    val underline: Boolean = false,
) {
    companion object {
        val None: TextStyles = TextStyles()
    }
}

/**
 * A run of a content string flagged as a search-term match ([highlighted]) or
 * not. In order, the runs' [text] concatenate back to the original input with no
 * gaps and no overlaps — so a plain-text row can wash the matches by mapping each
 * run onto a styled span, with no decision of its own.
 */
data class HighlightSegment(val text: String, val highlighted: Boolean)

/**
 * A single rendered run of a message body. Text runs carry emphasis; the three
 * link kinds carry both what to display and where to navigate.
 */
sealed interface MessageSegment {
    data class Text(val text: String, val styles: TextStyles = TextStyles.None) : MessageSegment
    data class MentionLink(val display: String, val username: String, val url: String) : MessageSegment
    data class MeeshyTokenLink(val display: String, val token: String, val url: String) : MessageSegment
    data class UrlLink(val display: String, val url: String) : MessageSegment
}

/**
 * Pure, stateless message-text SSOT — the Android port of the iOS
 * `MessageTextRenderer` parsing/highlight/extract logic. It turns a raw message
 * body into a list of [MessageSegment] runs in a single earliest-match-wins pass,
 * so the Compose layer only has to map runs → `AnnotatedString` (glue, no
 * decisions).
 *
 * Supported treatments, applied by a priority-ordered rule pipeline (first match
 * at the lowest index wins; ties keep the earlier-registered rule):
 * - **Markdown**: `**bold**`, `*italic*`, `~~strikethrough~~`, `__underline__`
 *   (nested via recursion — inner emphasis unions the outer style).
 * - **Mentions**: `@username` → `https://meeshy.me/u/<username>`, with optional
 *   display-name resolution (`@John Doe` when a `username → "John Doe"` map is
 *   supplied) that wins over the bare-username fallback at the same position.
 * - **Meeshy links**: `m+TOKEN` → `https://meeshy.me/l/<TOKEN>`.
 * - **URLs**: `http(s)://…` via a pure O(n) regex (no `NSDataDetector` analogue).
 */
object MessageTextParser {

    /**
     * Segment [text] into styled runs and links. [mentionDisplayNames] maps a
     * `username → display name`; a display name with whitespace lets `@Display
     * Name` resolve to the user (bare `@username` still resolves without it).
     */
    fun parse(text: String, mentionDisplayNames: Map<String, String>? = null): List<MessageSegment> =
        parseInternal(text, TextStyles.None, mentionDisplayNames)

    /**
     * All accent- and case-insensitive, non-overlapping occurrences of [term] in
     * [text], as char-index ranges into the ORIGINAL [text] suitable for highlight
     * spans — iOS `.diacriticInsensitive`/`.caseInsensitive` parity, so a query
     * typed without accents ("cafe") still highlights accented text ("café"), and
     * vice versa. Empty [term], or a [term] that folds away to nothing (only
     * combining marks), → no ranges. When the match lands on a decomposed grapheme,
     * the range extends over its trailing combining marks so no half-grapheme is
     * highlighted.
     */
    fun highlightRanges(text: String, term: String): List<IntRange> {
        if (term.isEmpty()) return emptyList()
        val needle = SearchTextFolder.fold(term)
        if (needle.isEmpty()) return emptyList()
        val haystack = SearchTextFolder.foldWithMap(text)
        val ranges = mutableListOf<IntRange>()
        var start = 0
        while (true) {
            val idx = haystack.folded.indexOf(needle, start)
            if (idx < 0) break
            val endFolded = idx + needle.length
            val originStart = haystack.sourceIndexOf[idx]
            val originEndExclusive =
                if (endFolded < haystack.folded.length) haystack.sourceIndexOf[endFolded] else text.length
            ranges.add(originStart until originEndExclusive)
            start = endFolded
        }
        return ranges
    }

    /**
     * Split [text] into alternating highlighted / plain [HighlightSegment] runs
     * for the accent- and case-insensitive occurrences of [term] (see
     * [highlightRanges]). The runs cover [text] with no gaps and no overlaps and
     * concatenate back to it exactly, so a plain-text surface — a global-search
     * result row (iOS `highlightedText`) — washes the matches by mapping each run
     * onto a styled span (glue, no decisions), without re-running the search.
     *
     * Boundaries: an empty [text] yields no runs; an empty [term], or one that
     * matches nothing, yields a single plain run carrying the whole [text]; two
     * adjacent matches yield back-to-back highlighted runs with no empty filler
     * between them. Because matching is accent-folded, a highlighted run may keep
     * more characters than [term] has (an accented grapheme highlighted whole).
     */
    fun highlightedSegments(text: String, term: String): List<HighlightSegment> {
        if (text.isEmpty()) return emptyList()
        val ranges = highlightRanges(text, term)
        if (ranges.isEmpty()) return listOf(HighlightSegment(text, highlighted = false))
        val segments = mutableListOf<HighlightSegment>()
        var cursor = 0
        for (range in ranges) {
            val start = range.first
            val endExclusive = range.last + 1
            if (start > cursor) {
                segments.add(HighlightSegment(text.substring(cursor, start), highlighted = false))
            }
            segments.add(HighlightSegment(text.substring(start, endExclusive), highlighted = true))
            cursor = endExclusive
        }
        if (cursor < text.length) {
            segments.add(HighlightSegment(text.substring(cursor), highlighted = false))
        }
        return segments
    }

    /**
     * Every navigable URL found in [text] — Meeshy share links first, then
     * `@mention` user pages, then raw `http(s)` URLs (used for link-preview / OG
     * card resolution). Order mirrors the iOS `extractURLs`.
     */
    fun extractUrls(text: String): List<String> {
        if (text.isEmpty()) return emptyList()
        val urls = mutableListOf<String>()
        meeshyLinkRegex.findAll(text).forEach { urls.add(meeshyUrl(it.groupValues[1])) }
        mentionRegex.findAll(text).forEach { urls.add(mentionUrl(it.groupValues[1])) }
        urlRegex.findAll(text).forEach { urls.add(it.value) }
        return urls
    }

    /**
     * Resolve the tappable destination for a raw URL string. Returns the gateway
     * tracking redirect (`https://meeshy.me/l/<token>`) when [raw] — or its
     * trailing-punctuation-trimmed form — is a key in [trackedLinks]; otherwise
     * [raw] unchanged. The DISPLAYED text always stays [raw]; only the target
     * changes.
     */
    fun resolvedLinkUrl(raw: String, trackedLinks: Map<String, String>?): String {
        if (trackedLinks.isNullOrEmpty()) return raw
        trackedLinks[raw]?.let { return meeshyUrl(it) }
        val trimmed = raw.trimEnd { it in trailingLinkPunctuation }
        if (trimmed != raw) {
            trackedLinks[trimmed]?.let { return meeshyUrl(it) }
        }
        return raw
    }

    // ----- internals -----

    private sealed interface RuleKind {
        data object Bold : RuleKind
        data object Italic : RuleKind
        data object Strikethrough : RuleKind
        data object Underline : RuleKind
        data object MeeshyLink : RuleKind
        data object Mention : RuleKind
        data object Url : RuleKind
        data class DisplayNameMention(val username: String) : RuleKind
    }

    private val boldRegex = Regex("""\*\*(.+?)\*\*""", RegexOption.DOT_MATCHES_ALL)
    private val strikethroughRegex = Regex("""~~(.+?)~~""")
    private val underlineRegex = Regex("""__(.+?)__""")
    private val italicRegex = Regex("""(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)""")
    private val meeshyLinkRegex = Regex("""(?<![a-zA-Z0-9])m\+([a-zA-Z0-9]+)""")
    private val mentionRegex = Regex("""(?<![a-zA-Z0-9])@([a-zA-Z0-9_]{1,30})""")
    private val urlRegex = Regex("""(?<![@\w])https?://[\w\-._~:/?#\[\]@!${'$'}&'()*+,;=%]+""")

    /**
     * Priority-ordered rules. Bold precedes italic so `**` is consumed before a
     * single `*`. Mirrors the iOS `rules` array (display-name rules run first,
     * URL last — both handled explicitly in [parseInternal]).
     */
    private val rules: List<Pair<Regex, RuleKind>> = listOf(
        boldRegex to RuleKind.Bold,
        strikethroughRegex to RuleKind.Strikethrough,
        underlineRegex to RuleKind.Underline,
        italicRegex to RuleKind.Italic,
        meeshyLinkRegex to RuleKind.MeeshyLink,
        mentionRegex to RuleKind.Mention,
    )

    private val trailingLinkPunctuation: Set<Char> = setOf('.', ',', ';', ':', '!', '?', ')', ']')

    private fun meeshyUrl(token: String) = "https://meeshy.me/l/$token"

    private fun mentionUrl(username: String) = "https://meeshy.me/u/$username"

    /**
     * Conservative superset of every rule's trigger. When false, no rule can
     * match and parsing short-circuits to a single plain text run — the dominant
     * case while scrolling.
     */
    private fun hasInlineSyntax(text: String): Boolean {
        for (c in text) {
            if (c == '*' || c == '~' || c == '_' || c == '@') return true
        }
        return text.contains("http") || text.contains("m+")
    }

    private fun displayNameRules(mentionDisplayNames: Map<String, String>): List<Pair<Regex, RuleKind>> =
        mentionDisplayNames.entries
            .sortedByDescending { it.value.length }
            .mapNotNull { (username, displayName) ->
                if (displayName == username) return@mapNotNull null
                if (displayName.isEmpty()) return@mapNotNull null
                if (displayName.none { it.isWhitespace() }) return@mapNotNull null
                val regex = Regex("(?<![a-zA-Z0-9])@${Regex.escape(displayName)}", RegexOption.IGNORE_CASE)
                regex to RuleKind.DisplayNameMention(username)
            }

    private fun parseInternal(
        text: String,
        inherited: TextStyles,
        mentionDisplayNames: Map<String, String>?,
    ): List<MessageSegment> {
        if (text.isEmpty()) return emptyList()
        if (!hasInlineSyntax(text)) return listOf(MessageSegment.Text(text, inherited))

        val dnRules = mentionDisplayNames?.let { displayNameRules(it) } ?: emptyList()
        val segments = mutableListOf<MessageSegment>()
        var cursor = 0
        val length = text.length

        while (cursor < length) {
            var bestMatch: MatchResult? = null
            var bestKind: RuleKind? = null

            fun consider(match: MatchResult?, kind: RuleKind) {
                if (match != null && (bestMatch == null || match.range.first < bestMatch!!.range.first)) {
                    bestMatch = match
                    bestKind = kind
                }
            }

            // Display-name rules first (longest / most specific match wins over `@username`).
            for ((regex, kind) in dnRules) consider(regex.find(text, cursor), kind)
            for ((regex, kind) in rules) consider(regex.find(text, cursor), kind)
            consider(urlRegex.find(text, cursor), RuleKind.Url)

            val match = bestMatch
            val kind = bestKind
            if (match == null || kind == null) {
                val remaining = text.substring(cursor)
                if (remaining.isNotEmpty()) segments.add(MessageSegment.Text(remaining, inherited))
                break
            }

            if (match.range.first > cursor) {
                segments.add(MessageSegment.Text(text.substring(cursor, match.range.first), inherited))
            }

            when (kind) {
                RuleKind.Bold -> segments.addAll(parseInternal(match.groupValues[1], inherited.copy(bold = true), null))
                RuleKind.Italic -> segments.addAll(parseInternal(match.groupValues[1], inherited.copy(italic = true), null))
                RuleKind.Strikethrough -> segments.addAll(parseInternal(match.groupValues[1], inherited.copy(strikethrough = true), null))
                RuleKind.Underline -> segments.addAll(parseInternal(match.groupValues[1], inherited.copy(underline = true), null))
                RuleKind.MeeshyLink -> {
                    val token = match.groupValues[1]
                    segments.add(MessageSegment.MeeshyTokenLink(match.value, token, meeshyUrl(token)))
                }
                RuleKind.Mention -> {
                    val username = match.groupValues[1]
                    segments.add(MessageSegment.MentionLink(match.value, username, mentionUrl(username)))
                }
                is RuleKind.DisplayNameMention -> {
                    segments.add(MessageSegment.MentionLink(match.value, kind.username, mentionUrl(kind.username)))
                }
                RuleKind.Url -> segments.add(MessageSegment.UrlLink(match.value, match.value))
            }

            cursor = match.range.last + 1
        }

        return segments
    }
}
