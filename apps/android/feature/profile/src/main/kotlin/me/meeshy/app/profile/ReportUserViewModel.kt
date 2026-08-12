package me.meeshy.app.profile

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.report.ReportRequestBuilder
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.report.ReportRepository
import javax.inject.Inject

/** Immutable UI state for the "report a user" sheet (feature-parity §K). */
data class ReportUserUiState(
    val reasons: List<ReportReason> = ReportReason.ordered,
    val selectedReason: ReportReason = ReportReason.SPAM,
    val details: String = "",
    val isSubmitting: Boolean = false,
    val isSubmitted: Boolean = false,
    val hasError: Boolean = false,
) {
    /** Live character count for the details field (never exceeds the cap — enforced on input). */
    val detailsCount: Int get() = details.length

    /** The submit button is live unless a submission is in flight or already succeeded. */
    val canSubmit: Boolean get() = !isSubmitting && !isSubmitted
}

/**
 * Drives the report-a-user sheet — port of the iOS `ReportUserView`, upgraded to a testable UDF
 * ViewModel with an explicit success/error state (iOS keeps this in view-local `@State`).
 *
 * The reason and the free-text details are held in an immutable [ReportUserUiState]; [submit]
 * projects them through [ReportRepository] (which reuses the pure [ReportRequestBuilder] SSOT).
 * A submission in flight or already-succeeded short-circuits a re-tap ([ReportUserUiState.canSubmit]),
 * so a double tap never fires two reports. An inert repository result (no session) or a network
 * failure both surface [ReportUserUiState.hasError] and clear `isSubmitting`, so the user can retry.
 */
@HiltViewModel
class ReportUserViewModel @Inject constructor(
    private val reportRepository: ReportRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val userId: String = savedStateHandle.get<String>(USER_ID_ARG)?.trim().orEmpty()

    /** The reported user's handle, for the sheet title. Cosmetic — may be blank. */
    val username: String = savedStateHandle.get<String>(USERNAME_ARG).orEmpty()

    private val _state = MutableStateFlow(ReportUserUiState())
    val state: StateFlow<ReportUserUiState> = _state.asStateFlow()

    fun selectReason(reason: ReportReason) {
        _state.update { it.copy(selectedReason = reason, hasError = false) }
    }

    fun onDetailsChange(value: String) {
        // Enforce the same cap the pure builder applies, so the field and the wire body agree.
        _state.update { it.copy(details = value.take(ReportRequestBuilder.MAX_DETAILS_LENGTH), hasError = false) }
    }

    fun submit() {
        val current = _state.value
        if (!current.canSubmit) return
        _state.update { it.copy(isSubmitting = true, hasError = false) }
        viewModelScope.launch {
            val result = reportRepository.reportUser(userId, current.selectedReason, current.details)
            _state.update {
                if (result is NetworkResult.Success) {
                    it.copy(isSubmitting = false, isSubmitted = true)
                } else {
                    it.copy(isSubmitting = false, hasError = true)
                }
            }
        }
    }

    companion object {
        const val USER_ID_ARG = "userId"
        const val USERNAME_ARG = "username"
    }
}
