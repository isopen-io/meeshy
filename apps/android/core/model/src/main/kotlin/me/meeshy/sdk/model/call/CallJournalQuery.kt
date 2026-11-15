package me.meeshy.sdk.model.call

import java.text.Normalizer
import java.util.Locale

/** Direction filter of the call journal — the gateway `filter` enum. */
enum class CallJournalFilter(val wire: String) {
    ALL("all"),
    MISSED("missed"),
}

/** Media filter of the call journal — the gateway `type` enum (#8203). */
enum class CallJournalType(val wire: String) {
    ALL("all"),
    AUDIO("audio"),
    VIDEO("video"),
}

/**
 * What the journal asks for: direction filter x media type x typed name.
 * Port of iOS `CallJournalQuery` (`CallsViewModel.swift`). Each query owns one
 * cache entry ([cacheKey]); the default one is the Room-backed journal.
 */
data class CallJournalQuery(
    val filter: CallJournalFilter = CallJournalFilter.ALL,
    val type: CallJournalType = CallJournalType.ALL,
    val search: String = "",
) {
    /** Search folded (no case, no diacritics, trimmed) — the form compared and keyed. */
    val foldedSearch: String get() = foldForSearch(search)

    /** The unfiltered journal, served by Room. */
    val isDefault: Boolean
        get() = filter == CallJournalFilter.ALL && type == CallJournalType.ALL && foldedSearch.isEmpty()

    val cacheKey: String
        get() {
            val base = "calls:list:${filter.wire}"
            val typed = if (type == CallJournalType.ALL) base else "$base:type=${type.wire}"
            return if (foldedSearch.isEmpty()) typed else "$typed:q=$foldedSearch"
        }

    val wireFilter: String get() = filter.wire

    /** `null` for [CallJournalType.ALL]: the parameter is simply not sent. */
    val wireType: String? get() = if (type == CallJournalType.ALL) null else type.wire

    /** Folded and capped at the gateway's `maxLength` (100); `null` when blank. */
    val wireSearch: String? get() = foldedSearch.take(MAX_SEARCH_LENGTH).ifEmpty { null }

    /** The same narrowing computed locally — what offline and typing-in-progress show. */
    fun apply(records: List<CallRecord>, fallbackName: String): List<CallRecord> =
        records.filter { record ->
            val directionOk = filter == CallJournalFilter.ALL || record.isMissed
            val typeOk = when (type) {
                CallJournalType.ALL -> true
                CallJournalType.AUDIO -> !record.isVideo
                CallJournalType.VIDEO -> record.isVideo
            }
            directionOk && typeOk && record.matches(search, fallbackName)
        }

    companion object {
        const val MAX_SEARCH_LENGTH: Int = 100
    }
}

private val COMBINING_MARKS = Regex("\\p{Mn}+")

/** Lowercase, diacritic-free, trimmed — the web's and iOS's journal search folding. */
internal fun foldForSearch(text: String): String =
    COMBINING_MARKS
        .replace(Normalizer.normalize(text, Normalizer.Form.NFD), "")
        .lowercase(Locale.ROOT)
        .trim()

/**
 * Journal search (#8066): the displayed name (fallback included), the peer's
 * username and a group call's participants. A blank [query] matches everything.
 */
fun CallRecord.matches(query: String, fallbackName: String): Boolean {
    val needle = foldForSearch(query)
    if (needle.isEmpty()) return true
    val shown = displayName(fallbackName)
    val fields = listOf(shown, peer?.username) +
        participants.flatMap { listOf(it.displayName, it.username) }
    return fields.filterNotNull().any { foldForSearch(it).contains(needle) }
}
