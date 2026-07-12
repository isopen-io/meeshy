package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.diagnostics.CrashDiagnostic
import me.meeshy.sdk.model.diagnostics.CrashReportFormatter
import javax.inject.Inject

/** Why a diagnostics action failed — localized by the screen, not the ViewModel. */
enum class CrashReportError { LOAD, CLEAR }

/**
 * Immutable UI state for the crash-diagnostics viewer (feature-parity §L).
 *
 * [reports] is the store's newest-first, retention-capped list. [shareContent] is derived from the
 * pure [CrashReportFormatter] so the share text and the on-screen order are always the same SSOT.
 */
data class CrashReportUiState(
    val reports: List<CrashDiagnostic> = emptyList(),
    val isLoading: Boolean = false,
    val isClearing: Boolean = false,
    val error: CrashReportError? = null,
) {
    val isEmpty: Boolean get() = reports.isEmpty()

    /** Shareable plain-text report; empty when there is nothing to share. */
    val shareContent: String get() = CrashReportFormatter.formatAll(reports)

    /** Clear-all is offered only when something is stored and no clear is already running. */
    val canClear: Boolean get() = reports.isNotEmpty() && !isClearing
}

/**
 * Drives the crash-diagnostics viewer: loads the persisted incidents from [CrashDiagnosticsStore]
 * (newest-first, already capped), exposes the shareable text via the pure formatter, and clears the
 * store on demand.
 *
 * A clear is **optimistic**: the list is emptied in state immediately (snapshot kept for rollback),
 * the disk wipe runs, then state settles. Clearing an already-empty store is inert, a second clear
 * while one is in flight is ignored, and a failure rolls the list back and raises
 * [CrashReportError.CLEAR]. `viewModelScope` work rethrows [CancellationException] so a torn-down
 * scope never leaves a spurious error.
 */
@HiltViewModel
class CrashReportViewModel @Inject constructor(
    private val store: CrashDiagnosticsStore,
) : ViewModel() {

    private val _state = MutableStateFlow(CrashReportUiState(isLoading = true))
    val state: StateFlow<CrashReportUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val reports = store.reports()
                _state.update { it.copy(reports = reports, isLoading = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.update { it.copy(isLoading = false, error = CrashReportError.LOAD) }
            }
        }
    }

    fun clear() {
        val snapshot = _state.value
        if (snapshot.isClearing || snapshot.reports.isEmpty()) return
        val previous = snapshot.reports

        _state.update { it.copy(reports = emptyList(), isClearing = true, error = null) }
        viewModelScope.launch {
            try {
                store.clear()
                _state.update { it.copy(isClearing = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.update {
                    it.copy(reports = previous, isClearing = false, error = CrashReportError.CLEAR)
                }
            }
        }
    }
}
