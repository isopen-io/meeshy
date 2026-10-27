package me.meeshy.app.calls

import me.meeshy.sdk.model.call.CallJournalFilter
import me.meeshy.sdk.model.call.CallJournalQuery
import me.meeshy.sdk.model.call.CallJournalType
import me.meeshy.sdk.model.call.CallRecord

/**
 * The single immutable snapshot the recent/missed-calls list renders. Every field
 * is derived by [CallHistoryViewModel]; the screen stays pure glue.
 *
 * Instant-app (ARCHITECTURE.md §4): [showSkeleton] is true only on a cold, empty,
 * error-free cache — cached rows always paint immediately, background refresh is
 * signalled by [isSyncing], never a blocking spinner.
 */
data class CallHistoryUiState(
    val records: List<CallRecord> = emptyList(),
    val isSyncing: Boolean = false,
    val isUserRefreshing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
    val hasMore: Boolean = true,
    val isLoadingMore: Boolean = false,
    val missedOnly: Boolean = false,
    /** Le filtre « Vidéo » (iOS `viewModel.type == .video`). */
    val videoOnly: Boolean = false,
    /** Le nom tapé dans le champ de recherche, tel quel. */
    val searchQuery: String = "",
    /** Le dernier effacement a été refusé par la passerelle : la bannière le dit. */
    val eraseFailed: Boolean = false,
) {
    /** Ce que le journal demande : direction × type de média × nom tapé (iOS `CallJournalQuery`). */
    val query: CallJournalQuery
        get() = CallJournalQuery(
            filter = if (missedOnly) CallJournalFilter.MISSED else CallJournalFilter.ALL,
            type = if (videoOnly) CallJournalType.VIDEO else CallJournalType.ALL,
            search = searchQuery,
        )

    /** Un filtre ou une recherche est actif : la liste se remplit en paginant d'elle-même. */
    val isFiltered: Boolean get() = !query.isDefault

    /** Un nom est tapé : les états vides parlent de la recherche. */
    val isSearching: Boolean get() = query.foldedSearch.isNotEmpty()

    /**
     * The missed-only filter is active yet nothing matches — distinct from a
     * cold-empty cache (which shows the skeleton) so the UI can show an
     * "aucun appel manqué" state instead of the cold placeholder.
     */
    val isFilteredEmpty: Boolean
        get() = records.isEmpty() && !showSkeleton && errorMessage == null && missedOnly
}

/**
 * Which body the journal shows — one decision for the four states, so an offline
 * cold start reads « Erreur lors du chargement » (with retry) rather than « Aucun
 * appel », and the missed filter still paging on its own shows the list footer
 * rather than claiming there is no missed call.
 */
enum class CallHistoryContent {
    SKELETON, ERROR, EMPTY, LIST;

    companion object {
        fun of(state: CallHistoryUiState): CallHistoryContent = when {
            state.showSkeleton -> SKELETON
            state.records.isNotEmpty() -> LIST
            state.errorMessage != null -> ERROR
            state.isFiltered && (state.hasMore || state.isLoadingMore) -> LIST
            else -> EMPTY
        }
    }
}
