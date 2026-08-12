package me.meeshy.app.conversations

import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.isMeaningful

/**
 * The pure "discard this conversation's draft" product rule — parity §B draft
 * lifecycle. A row exposes the discard affordance only when it currently holds a
 * *meaningful* draft (the same [ConversationDraft.isMeaningful] SSOT that floats it
 * to the top and shows its "Brouillon : …" preview), so the action is never offered
 * on a row with nothing to throw away.
 *
 * Discarding drops that conversation's entry from the drafts map; the identical map
 * instance is returned when there was nothing to remove, so an absent/idempotent
 * discard never triggers a needless recomposition.
 *
 * A pure product rule (`:feature`), not an SDK atom: it encodes the "when can you
 * discard / what remains after" decision. Kept off the ViewModel/Composable so
 * every branch is JVM-testable.
 */
public object DraftDiscard {

    /** True iff [conversationId] currently holds a meaningful (surfaced) draft. */
    public fun isDiscardable(
        conversationId: String,
        draftsById: Map<String, ConversationDraft>,
    ): Boolean = draftsById[conversationId]?.isMeaningful == true

    /**
     * The drafts map after discarding [conversationId] — the entry is removed when
     * present, else the same instance is returned unchanged (a no-op discard).
     */
    public fun afterDiscard(
        conversationId: String,
        draftsById: Map<String, ConversationDraft>,
    ): Map<String, ConversationDraft> =
        if (draftsById.containsKey(conversationId)) draftsById - conversationId else draftsById
}
