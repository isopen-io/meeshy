package me.meeshy.app.conversations

import java.time.Instant
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.isMeaningful

/**
 * Draft-aware re-ordering of an (already filtered) conversation list — parity §B
 * "Draft-aware ordering (drafts float to top)". iOS floats conversations whose
 * composer holds an unsent draft to the top of the list so the user is nudged to
 * finish what they started.
 *
 * A conversation floats iff [draftsById] holds a *meaningful* draft for its id
 * (non-blank text or an armed reply — [ConversationDraft.isMeaningful], the shared
 * SSOT). Floated rows are ordered by draft [ConversationDraft.updatedAt] descending
 * (the most recently touched draft first); a draft with no timestamp sorts last
 * among the floated group. The sort is stable, so rows with equal (or absent)
 * timestamps keep their incoming relative order, and every non-draft row keeps its
 * incoming order below the floated group.
 *
 * A pure product rule (`:feature`), not an SDK atom: it encodes the "when to float"
 * decision. Kept off the Composable/ViewModel so every branch is JVM-testable.
 */
public object DraftAwareOrdering {

    public fun apply(
        conversations: List<ApiConversation>,
        draftsById: Map<String, ConversationDraft>,
    ): List<ApiConversation> {
        if (draftsById.isEmpty()) return conversations

        val (floated, rest) = conversations.partition { draftsById[it.id]?.isMeaningful == true }
        if (floated.isEmpty()) return conversations

        // Parse to Instant rather than comparing the raw ISO-8601 strings: Instant.toString()
        // omits the fractional-second suffix when it's exactly zero (".../56Z" vs ".../56.500Z"),
        // and '.' sorts lexicographically BEFORE 'Z' — a whole-second timestamp then sorts as
        // GREATER than a later, sub-second one, silently inverting the "most recent first" order.
        // Instant is genuinely Comparable by instant, and Kotlin's sortedByDescending already
        // treats a null/unparseable key as least-of-all, so it still sorts last — same as before.
        val orderedFloated = floated.sortedByDescending { conversation ->
            draftsById.getValue(conversation.id).updatedAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
        }
        return orderedFloated + rest
    }
}
