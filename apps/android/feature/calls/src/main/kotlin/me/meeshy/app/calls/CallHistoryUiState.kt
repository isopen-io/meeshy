package me.meeshy.app.calls

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
) {
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
            state.missedOnly && (state.hasMore || state.isLoadingMore) -> LIST
            else -> EMPTY
        }
    }
}
