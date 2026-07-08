package me.meeshy.app.chat

import me.meeshy.sdk.model.MentionCandidate

/**
 * Pure state of the composer @-mention autocomplete. [activeQuery] is the trailing
 * `@fragment` currently being typed (`null` when no mention is in progress);
 * [suggestions] are the roster candidates matching it; [draftMentions] tracks the
 * candidates the user has inserted (keyed by username) so a later send can resolve
 * their display names / build the mentions payload.
 */
data class MentionAutocompleteState(
    val activeQuery: String? = null,
    val suggestions: List<MentionCandidate> = emptyList(),
    val draftMentions: Map<String, MentionCandidate> = emptyMap(),
) {
    val isActive: Boolean get() = activeQuery != null
}

/**
 * The composer mention SSOT — port of the pure logic in the iOS
 * `MentionComposerController`. Every function is total and side-effect-free.
 */
object ChatMention {

    /**
     * The trailing `@query` fragment at the end of [text], or `null` when no mention
     * is in progress. Mirrors iOS: a mention is active only when the text past the
     * last `@` contains no space (the user is still typing a username). A bare `@`
     * yields the empty string (show the full roster); the absence of `@` yields
     * `null`.
     */
    fun extractQuery(text: String): String? {
        val lastAt = text.lastIndexOf('@')
        if (lastAt < 0) return null
        val fragment = text.substring(lastAt + 1)
        if (fragment.contains(' ')) return null
        return fragment
    }

    /**
     * Candidates matching [query] — a trimmed, case-insensitive substring over the
     * username **or** the display name. A blank query returns every candidate,
     * preserving order.
     */
    fun filterCandidates(
        candidates: List<MentionCandidate>,
        query: String,
    ): List<MentionCandidate> {
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) return candidates
        return candidates.filter {
            it.username.lowercase().contains(needle) || it.displayName.lowercase().contains(needle)
        }
    }

    /**
     * Replace the trailing `@query` fragment in [text] with `@username ` (with a
     * trailing space, so the caret lands ready for the next word). Inert — returns
     * [text] unchanged — when there is no active mention fragment (no `@`, or a
     * space already sits past the last `@`).
     */
    fun insertMention(candidate: MentionCandidate, text: String): String {
        val lastAt = text.lastIndexOf('@')
        if (lastAt < 0) return text
        val fragment = text.substring(lastAt + 1)
        if (fragment.contains(' ')) return text
        return text.substring(0, lastAt) + "@${candidate.username} "
    }
}

/** Recompute the mention state after the composer [text] changed. */
fun MentionAutocompleteState.onTextChange(
    text: String,
    candidates: List<MentionCandidate>,
): MentionAutocompleteState {
    val query = ChatMention.extractQuery(text) ?: return cleared()
    return copy(activeQuery = query, suggestions = ChatMention.filterCandidates(candidates, query))
}

/** Dismiss the suggestion panel. Draft-mention tracking is preserved; inert if already dismissed. */
fun MentionAutocompleteState.cleared(): MentionAutocompleteState =
    if (activeQuery == null && suggestions.isEmpty()) this
    else copy(activeQuery = null, suggestions = emptyList())

/**
 * Insert [candidate] into [text], record it as a draft mention, and dismiss the
 * panel. Returns the rewritten text paired with the next state.
 */
fun MentionAutocompleteState.select(
    candidate: MentionCandidate,
    text: String,
): Pair<String, MentionAutocompleteState> {
    val newText = ChatMention.insertMention(candidate, text)
    val next = cleared().copy(draftMentions = draftMentions + (candidate.username to candidate))
    return newText to next
}

/** Reset everything — panel and draft-mention tracking — e.g. after a successful send. */
fun MentionAutocompleteState.reset(): MentionAutocompleteState = MentionAutocompleteState()
