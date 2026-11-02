package me.meeshy.sdk.model.search

/**
 * Turns what the user typed into an FTS4 `MATCH` expression that can only ever mean "every word,
 * as a prefix". Each word is folded by [SearchTextFolder] (accents, case) — the fold the index
 * applies through its tokenizer — and wrapped in a quoted phrase, so `OR`, `NOT`, `NEAR`, `-`, `*`
 * and parentheses typed by the user are plain text, never operators. Mirrors the sanitisation of
 * iOS `SearchIndex.runSearch` (quotes removed, phrase, trailing `*`).
 */
public object FtsQuerySanitizer {

    /** The `MATCH` argument for [raw], or `null` when nothing searchable was typed. */
    public fun match(raw: String): String? =
        raw.trim()
            .split(WHITESPACE)
            .map { SearchTextFolder.fold(it).replace("\"", "") }
            .filter { word -> word.any(Char::isLetterOrDigit) }
            .takeIf { it.isNotEmpty() }
            ?.joinToString(" ") { "\"$it*\"" }

    private val WHITESPACE = Regex("\\s+")
}
