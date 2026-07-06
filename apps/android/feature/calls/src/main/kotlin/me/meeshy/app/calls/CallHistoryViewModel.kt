package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.call.CallHistoryRepository
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

/**
 * UDF ViewModel for the recent/missed-calls list — port of the iOS call-history
 * screen. Cache-first: the cached journal paints immediately from
 * [CallHistoryRepository.historyStream] (SWR), older pages are appended via
 * [CallHistoryRepository.fetchPage], and the missed-only filter is applied
 * client-side (instant, no network). All list algebra lives in the pure
 * [CallHistoryList]; this class only orchestrates intents and side-effects.
 */
@HiltViewModel
class CallHistoryViewModel @Inject constructor(
    private val repository: CallHistoryRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(CallHistoryUiState())
    val state: StateFlow<CallHistoryUiState> = _state.asStateFlow()

    /** Authoritative cache head; [CallHistoryUiState.records] is the derived view. */
    private var streamRecords: List<CallRecord> = emptyList()

    /** Older pages appended by [loadMoreIfNeeded]. */
    private var pagedRecords: List<CallRecord> = emptyList()

    /** Cursor for the next [CallHistoryRepository.fetchPage]; `null` starts at the head. */
    private var nextCursor: String? = null

    init {
        viewModelScope.launch {
            repository.historyStream(
                onSyncError = { error ->
                    _state.update {
                        it.copy(errorMessage = error.message, isSyncing = false, showSkeleton = false)
                    }
                },
            ).collect { result ->
                streamRecords = result.recordsOr(streamRecords)
                _state.update { it.applyResultFlags(result).withVisible() }
            }
        }
    }

    /** Toggles the missed-only filter and re-derives the visible list (no network). */
    fun setMissedOnly(value: Boolean) {
        _state.update { it.copy(missedOnly = value).withVisible() }
    }

    /**
     * Infinite-scroll trigger: once [callId] is within [LOAD_MORE_THRESHOLD] of the
     * visible tail and more pages remain, fetch the next page and append it
     * (de-duplicated by [CallHistoryList.combine]). Re-entrancy is guarded by
     * [CallHistoryUiState.isLoadingMore]; a failure surfaces a message and the
     * next scroll re-triggers the fetch.
     */
    fun loadMoreIfNeeded(callId: String) {
        val current = _state.value
        val index = current.records.indexOfFirst { it.callId == callId }
        if (index < 0 || index < current.records.size - LOAD_MORE_THRESHOLD) return
        if (!current.hasMore || current.isLoadingMore) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                when (val result = repository.fetchPage(cursor = nextCursor)) {
                    is NetworkResult.Success -> {
                        nextCursor = result.data.nextCursor
                        pagedRecords = pagedRecords + result.data.records
                        _state.update { it.copy(hasMore = result.data.hasMore).withVisible() }
                    }
                    is NetworkResult.Failure ->
                        _state.update { it.copy(errorMessage = result.error.message) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            } finally {
                _state.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    /**
     * Pull-to-refresh: revalidates the cached head (the stream re-emits) and
     * resets paging so a changed journal is not shown alongside stale older pages.
     * The visible spinner tracks this user gesture only ([isUserRefreshing]);
     * silent background SWR revalidations stay in [isSyncing].
     */
    fun refresh() {
        pagedRecords = emptyList()
        nextCursor = null
        _state.update {
            it.copy(
                errorMessage = null,
                isSyncing = true,
                isUserRefreshing = true,
                hasMore = true,
            ).withVisible()
        }
        viewModelScope.launch {
            try {
                repository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message, showSkeleton = false) }
            } finally {
                _state.update { it.copy(isUserRefreshing = false, isSyncing = false) }
            }
        }
    }

    private fun CallHistoryUiState.withVisible(): CallHistoryUiState =
        copy(records = CallHistoryList.filter(CallHistoryList.combine(streamRecords, pagedRecords), missedOnly))

    /**
     * Maps a [CacheResult]'s SWR flags onto the screen state — skeleton only on a
     * cold, error-free empty cache. The visible list is derived separately by
     * [withVisible] so the missed-only filter never triggers the cold skeleton.
     */
    private fun CallHistoryUiState.applyResultFlags(result: CacheResult<List<CallRecord>>): CallHistoryUiState {
        val combinedEmpty = streamRecords.isEmpty() && pagedRecords.isEmpty()
        return when (result) {
            is CacheResult.Fresh -> copy(isSyncing = false, showSkeleton = false, errorMessage = null)
            is CacheResult.Stale -> copy(isSyncing = true, showSkeleton = false)
            is CacheResult.Syncing -> copy(
                isSyncing = true,
                showSkeleton = result.value == null && combinedEmpty && errorMessage == null,
            )
            CacheResult.Empty -> copy(isSyncing = false, showSkeleton = errorMessage == null)
        }
    }

    private companion object {
        const val LOAD_MORE_THRESHOLD = 5
    }
}

/** Extracts the list carried by a [CacheResult], keeping [fallback] when a sync carries no value yet. */
private fun CacheResult<List<CallRecord>>.recordsOr(fallback: List<CallRecord>): List<CallRecord> = when (this) {
    is CacheResult.Fresh -> value
    is CacheResult.Stale -> value
    is CacheResult.Syncing -> value ?: fallback
    CacheResult.Empty -> emptyList()
}
