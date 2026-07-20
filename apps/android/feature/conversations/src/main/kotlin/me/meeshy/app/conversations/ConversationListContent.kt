package me.meeshy.app.conversations

/**
 * Which region the conversation-list body renders. The single source of truth
 * for the empty-state decision (parity §B "Cold-start skeletons + error-with-
 * retry empty state"), lifted out of [ConversationListScreen] so the branching
 * is pure and fully covered rather than untestable Composable glue.
 */
sealed interface ConversationListContent {
    /** The cached list has rows — render them (pull-to-refresh, sections). */
    data object Populated : ConversationListContent

    /** Cold, empty cache still loading — the only time a skeleton is shown. */
    data object Skeleton : ConversationListContent

    /** Empty cache after a sync failure — show [message] with a retry CTA. */
    data class Error(val message: String) : ConversationListContent

    /** A filter/search narrowed the list to nothing (distinct from cold-empty). */
    data object FilteredEmpty : ConversationListContent

    /** An empty account with no filter, no error — the true "no conversations" state. */
    data object ColdEmpty : ConversationListContent

    companion object {
        /**
         * Cache-first (ARCHITECTURE.md §4): a populated list always wins, so a
         * stale skeleton flag or a background sync error never hides data that is
         * already on screen. Only once the visible list is empty do the loading /
         * error / filtered / cold branches apply, in that precedence order.
         */
        fun of(state: ConversationListUiState): ConversationListContent = when {
            state.conversations.isNotEmpty() -> Populated
            state.showSkeleton -> Skeleton
            state.errorMessage != null -> Error(state.errorMessage)
            state.isFilteredEmpty -> FilteredEmpty
            else -> ColdEmpty
        }
    }
}
