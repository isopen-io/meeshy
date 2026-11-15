package me.meeshy.sdk.model.conversationoptions

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

    /**
     * Take the conversation back out of its category (`categoryId = null`, iOS
     * `CategoryPickerField` → `category.remove`). The write must reach the gateway
     * as an explicit `"categoryId": null` — an omitted field leaves it untouched.
     */
    public data object Clear : CategoryReassignment
}

/**
 * Pure decision for a conversation → user-category (re)assignment — the single
 * source of truth for "moving a conversation to a category is idempotent": a drop
 * onto the category the row already sits in is inert, every other target reassigns.
 * The faithful port of iOS `ConversationOptionsViewModel.setCategory`, whose
 * optimistic mutation + network call only make sense when the id actually changes.
 *
 * A `null` target takes the conversation back to *uncategorized* (#13784): the
 * outbox snapshot then carries `clearCategory`, which the sender turns into an
 * explicit `"categoryId": null` despite the `explicitNulls = false` encoder.
 */
public object ConversationCategoryReassignment {
    /**
     * Resolves a reassignment of a conversation currently in [currentCategoryId]
     * (`null` when uncategorized) to [targetCategoryId] (a real user category, or
     * `null` to uncategorize). Returns [CategoryReassignment.Unchanged] when the
     * target already matches, [CategoryReassignment.Clear] for a `null` target,
     * else [CategoryReassignment.AssignTo].
     */
    public fun resolve(
        currentCategoryId: String?,
        targetCategoryId: String?,
    ): CategoryReassignment = when (targetCategoryId) {
        currentCategoryId -> CategoryReassignment.Unchanged
        null -> CategoryReassignment.Clear
        else -> CategoryReassignment.AssignTo(targetCategoryId)
    }
}
