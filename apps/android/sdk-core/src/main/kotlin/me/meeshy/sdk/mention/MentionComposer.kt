package me.meeshy.sdk.mention

import me.meeshy.sdk.model.MentionCandidate

/**
 * Pure state of a composer @-mention autocomplete. [activeQuery] is the trailing
 * `@fragment` currently being typed (`null` when no mention is in progress);
 * [suggestions] are the roster candidates matching it; [draftMentions] tracks the
 * candidates the user has inserted (keyed by username) so a later send can resolve
 * their display names / build the mentions payload.
 *
 * Shared SSOT across every text composer (chat messages, post comments) — promoted
 * from `:feature:chat` so a second surface reuses the same behaviour instead of
 * re-implementing it. Port of the pure iOS `MentionComposerController` logic.
 */
public data class MentionAutocompleteState(
    val activeQuery: String? = null,
    val suggestions: List<MentionCandidate> = emptyList(),
    val draftMentions: Map<String, MentionCandidate> = emptyMap(),
) {
    public val isActive: Boolean get() = activeQuery != null
}

/**
 * The composer mention SSOT — port of the pure logic in the iOS
 * `MentionComposerController`. Every function is total and side-effect-free.
 */
public object MentionComposer {

    /**
     * The trailing `@query` fragment at the end of [text], or `null` when no mention
     * is in progress. Mirrors iOS: a mention is active only when the text past the
     * last `@` contains no space (the user is still typing a username). A bare `@`
     * yields the empty string (show the full roster); the absence of `@` yields
     * `null`.
     */
    public fun extractQuery(text: String): String? {
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
    public fun filterCandidates(
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
    public fun insertMention(candidate: MentionCandidate, text: String): String {
        val lastAt = text.lastIndexOf('@')
        if (lastAt < 0) return text
        val fragment = text.substring(lastAt + 1)
        if (fragment.contains(' ')) return text
        return text.substring(0, lastAt) + "@${candidate.username} "
    }

    /**
     * Whether a remote directory lookup is worth firing for [query]. Mirrors iOS
     * `MentionComposerController`: the debounced API call only runs once at least two
     * significant characters are typed — a bare `@` or a single letter matches too
     * much of the directory to be useful and is served entirely from the local roster.
     */
    public fun shouldQueryRemote(query: String): Boolean = query.trim().length >= MIN_REMOTE_QUERY

    /**
     * Merge remote directory results into the [local] roster suggestions, local-first.
     * Ports iOS `mergeAPISuggestions`: locals keep their order and win every collision;
     * a remote candidate is appended only when its handle (trimmed, case-insensitive)
     * is neither blank, already among the locals, nor a duplicate of an earlier remote
     * result. A blank handle can never be addressed, so it is dropped.
     */
    public fun mergeSuggestions(
        local: List<MentionCandidate>,
        remote: List<MentionCandidate>,
    ): List<MentionCandidate> {
        val taken = local.mapTo(mutableSetOf()) { it.username.trim().lowercase() }
        val merged = local.toMutableList()
        remote.forEach { candidate ->
            val handle = candidate.username.trim().lowercase()
            if (handle.isEmpty() || !taken.add(handle)) return@forEach
            merged += candidate
        }
        return merged
    }

    private const val MIN_REMOTE_QUERY = 2
}

/** Recompute the mention state after the composer [text] changed. */
public fun MentionAutocompleteState.onTextChange(
    text: String,
    candidates: List<MentionCandidate>,
): MentionAutocompleteState {
    val query = MentionComposer.extractQuery(text) ?: return cleared()
    return copy(activeQuery = query, suggestions = MentionComposer.filterCandidates(candidates, query))
}

/**
 * Fold debounced remote directory results into the panel. The merge is applied only
 * when [query] still equals the [activeQuery] the lookup was fired for — a slower
 * response for a stale fragment (the user kept typing, or dismissed the panel) is
 * dropped, returning the same instance. This is the pure, testable equivalent of iOS's
 * `Task.isCancelled` staleness guard.
 */
public fun MentionAutocompleteState.applyRemote(
    query: String,
    remote: List<MentionCandidate>,
): MentionAutocompleteState {
    if (activeQuery != query) return this
    return copy(suggestions = MentionComposer.mergeSuggestions(suggestions, remote))
}

/** Dismiss the suggestion panel. Draft-mention tracking is preserved; inert if already dismissed. */
public fun MentionAutocompleteState.cleared(): MentionAutocompleteState =
    if (activeQuery == null && suggestions.isEmpty()) this
    else copy(activeQuery = null, suggestions = emptyList())

/**
 * Insert [candidate] into [text], record it as a draft mention, and dismiss the
 * panel. Returns the rewritten text paired with the next state.
 */
public fun MentionAutocompleteState.select(
    candidate: MentionCandidate,
    text: String,
): Pair<String, MentionAutocompleteState> {
    val newText = MentionComposer.insertMention(candidate, text)
    val next = cleared().copy(draftMentions = draftMentions + (candidate.username to candidate))
    return newText to next
}

/** Reset everything — panel and draft-mention tracking — e.g. after a successful send. */
public fun MentionAutocompleteState.reset(): MentionAutocompleteState = MentionAutocompleteState()
