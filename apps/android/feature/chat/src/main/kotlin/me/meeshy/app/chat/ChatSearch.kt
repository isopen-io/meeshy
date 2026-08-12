package me.meeshy.app.chat

/**
 * An opaque, searchable projection of a message: its id plus every text that a
 * query may match against. Carrying a list (rather than a single body) makes the
 * search **translation-match aware** — the displayed translation and the stored
 * original are both searchable, matching the iOS in-conversation search.
 */
data class SearchableMessage(
    val id: String,
    val texts: List<String>,
)

/**
 * Pure state of the in-conversation message search. [matchIds] are the ids of the
 * matching messages in display order; [activeIndex] points at the currently
 * focused hit. All transitions are pure — see [ChatSearch] and the extension
 * reducers below.
 */
data class ChatSearchState(
    val isActive: Boolean = false,
    val query: String = "",
    val matchIds: List<String> = emptyList(),
    val activeIndex: Int = 0,
) {
    val matchCount: Int get() = matchIds.size

    val hasMatches: Boolean get() = matchIds.isNotEmpty()

    val activeMessageId: String? get() = matchIds.getOrNull(activeIndex)

    /** One-based position of the active hit, or `0` when there are no matches. */
    val currentPosition: Int get() = if (matchIds.isEmpty()) 0 else activeIndex + 1

    /** The term to highlight in bubbles — the trimmed query, only while active and non-blank. */
    val highlightTerm: String? get() = if (isActive) query.trim().ifBlank { null } else null
}

/**
 * The in-conversation search SSOT. [matchIds] is the only genuinely stateful
 * computation; the reducers are thin pure transitions over [ChatSearchState].
 */
object ChatSearch {

    /**
     * Ids of every message in [messages] whose any text contains [query]
     * (trimmed, case-insensitive), in the given (display) order. A blank query
     * or a message with no texts yields no match.
     */
    fun matchIds(messages: List<SearchableMessage>, query: String): List<String> {
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) return emptyList()
        return messages
            .filter { message -> message.texts.any { it.lowercase().contains(needle) } }
            .map { it.id }
    }
}

/** Turn search on with a clean slate — any stale query/matches are dropped. */
fun ChatSearchState.activated(): ChatSearchState = ChatSearchState(isActive = true)

/** Turn search off and reset to the inert default. */
fun ChatSearchState.deactivated(): ChatSearchState = ChatSearchState()

/** Set the query, recompute the matches, and focus the first hit. */
fun ChatSearchState.withQuery(query: String, messages: List<SearchableMessage>): ChatSearchState =
    copy(query = query, matchIds = ChatSearch.matchIds(messages, query), activeIndex = 0)

/**
 * Recompute matches against a freshly arrived [messages] stream while preserving
 * the user's focus: if the active message still matches it keeps focus, otherwise
 * the first hit is focused. Inert while search is inactive.
 */
fun ChatSearchState.reconciled(messages: List<SearchableMessage>): ChatSearchState {
    if (!isActive) return this
    val previousActive = activeMessageId
    val ids = ChatSearch.matchIds(messages, query)
    val index = previousActive?.let { ids.indexOf(it) }?.takeIf { it >= 0 } ?: 0
    return copy(matchIds = ids, activeIndex = index)
}

/** Advance to the next hit, wrapping past the last back to the first. Inert with no matches. */
fun ChatSearchState.movedToNext(): ChatSearchState {
    if (matchIds.isEmpty()) return this
    return copy(activeIndex = (activeIndex + 1) % matchIds.size)
}

/** Step back to the previous hit, wrapping past the first to the last. Inert with no matches. */
fun ChatSearchState.movedToPrev(): ChatSearchState {
    if (matchIds.isEmpty()) return this
    return copy(activeIndex = (activeIndex - 1 + matchIds.size) % matchIds.size)
}
