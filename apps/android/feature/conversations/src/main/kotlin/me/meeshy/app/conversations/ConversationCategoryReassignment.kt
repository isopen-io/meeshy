package me.meeshy.app.conversations

/**
 * The outcome of reassigning a conversation to a user category (parity §B
 * drag-to-category / iOS `ConversationOptionsViewModel.setCategory`).
 */
public sealed interface CategoryReassignment {
    /**
     * The move changes nothing — the conversation is already in the target
     * category. The caller must **not** fire a network write, exactly as iOS's
     * `setCategory` leaves `prefs.categoryId` untouched when it already matches.
     */
    public data object Unchanged : CategoryReassignment

    /** Assign the conversation to [categoryId] (a real user category). */
    public data class AssignTo(val categoryId: String) : CategoryReassignment
}

/**
 * Pure decision for a conversation → user-category (re)assignment — the single
 * source of truth for "moving a conversation to a category is idempotent": a drop
 * onto the category the row already sits in is inert, every other target reassigns.
 * The faithful port of iOS `ConversationOptionsViewModel.setCategory`, whose
 * optimistic mutation + network call only make sense when the id actually changes.
 *
 * Scope note: this covers **assignment** to a real category (the primary
 * drag-to-category gesture and the context-menu "move to category" action).
 * Clearing a conversation back to *uncategorized* (`categoryId = null`) is a
 * separate concern — the shared JSON serializer omits null fields, so an
 * explicit-null `PUT` (needed to persist an uncategorize) is a tracked follow-up
 * — and is deliberately not modelled here to avoid exposing a decision the wiring
 * cannot yet honour.
 */
public object ConversationCategoryReassignment {
    /**
     * Resolves a reassignment of a conversation currently in [currentCategoryId]
     * (`null` when uncategorized) to [targetCategoryId] (a real user category).
     * Returns [CategoryReassignment.Unchanged] when the target already matches,
     * else [CategoryReassignment.AssignTo].
     */
    public fun resolve(
        currentCategoryId: String?,
        targetCategoryId: String,
    ): CategoryReassignment =
        if (targetCategoryId == currentCategoryId) {
            CategoryReassignment.Unchanged
        } else {
            CategoryReassignment.AssignTo(targetCategoryId)
        }
}
