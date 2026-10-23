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

    /** A category filter narrowed the list to nothing (distinct from cold-empty). */
    data object FilteredEmpty : ConversationListContent

    /** A non-blank search matched nothing — "No results / Try other terms" (iOS `searchNoResults`). */
    data object SearchNoResults : ConversationListContent

    /** An empty account with no filter, no error — the true "no conversations" state. */
    data object ColdEmpty : ConversationListContent

    companion object {
        /**
         * iOS `groupingAwaitsCorpus`: the sections are produced after the corpus, so a
         * grouping made on an EMPTY corpus must not be read as "nothing to show" once the
         * corpus has arrived. An empty grouping made on a NON-empty corpus is definitive
         * (everything archived, filter matching nothing) and is never a wait.
         */
        fun groupingAwaitsCorpus(
            groupedIsEmpty: Boolean,
            lastGroupedCorpusCount: Int,
            corpusCount: Int,
        ): Boolean = groupedIsEmpty && lastGroupedCorpusCount == 0 && corpusCount > 0

        /**
         * Cache-first (ARCHITECTURE.md §4), precedence: Populated > Skeleton > Error >
         * SearchNoResults / FilteredEmpty > ColdEmpty. A populated list always wins, so a
         * stale skeleton flag or a background sync error never hides rows already on screen.
         * [sectionsAwaitCorpus] (the rule above) keeps the skeleton while the corpus is
         * there but its sections are not yet produced — never a fleeting "empty" frame.
         */
        fun of(
            state: ConversationListUiState,
            sectionsAwaitCorpus: Boolean = false,
        ): ConversationListContent = when {
            sectionsAwaitCorpus -> Skeleton
            state.conversations.isNotEmpty() -> Populated
            state.showSkeleton -> Skeleton
            state.errorMessage != null -> Error(state.errorMessage)
            state.isFilteredEmpty && state.searchText.isNotBlank() -> SearchNoResults
            state.isFilteredEmpty -> FilteredEmpty
            else -> ColdEmpty
        }
    }
}
