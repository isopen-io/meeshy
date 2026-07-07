package me.meeshy.app.conversations

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

        val floated = ArrayList<ApiConversation>()
        val rest = ArrayList<ApiConversation>()
        conversations.forEach { conversation ->
            if (draftsById[conversation.id]?.isMeaningful == true) floated.add(conversation) else rest.add(conversation)
        }
        if (floated.isEmpty()) return conversations

        val orderedFloated = floated.sortedByDescending { draftsById.getValue(it.id).updatedAt ?: "" }
        return orderedFloated + rest
    }
}
