package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.AccountDeletionConfirmation
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/** The reason an account-deletion request failed — localized by the screen, not the VM. */
enum class AccountDeletionError { ALREADY_PENDING, NETWORK, GENERIC }

data class AccountDeletionUiState(
    val confirmationText: String = "",
    val isDeleting: Boolean = false,
    val isEmailSent: Boolean = false,
    val error: AccountDeletionError? = null,
) {
    /** Whether the typed phrase matches the gateway literal verbatim. */
    val isConfirmed: Boolean
        get() = AccountDeletionConfirmation.isConfirmed(confirmationText)

    /** Whether the delete button may fire — phrase confirmed and no request in flight. */
    val canSubmit: Boolean
        get() = isConfirmed && !isDeleting
}

/**
 * Drives the account-deletion screen (feature-parity §L, port of iOS `DeleteAccountView`).
 * Holds the confirmation buffer, gates the destructive submit behind the verbatim
 * [AccountDeletionConfirmation] phrase, and performs the single online
 * [UserRepository.deleteAccount] call. The gateway does **not** delete immediately — it
 * opens a 90-day grace period and mails a confirmation link — so on success the VM flips
 * [AccountDeletionUiState.isEmailSent] (no logout, no session teardown; the screen shows a
 * "check your inbox" state). A failure maps to a targeted [AccountDeletionError] the screen
 * localizes (`409` = a deletion is already pending; transport = network; else generic).
 */
@HiltViewModel
class AccountDeletionViewModel @Inject constructor(
    private val userRepository: UserRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AccountDeletionUiState())
    val state: StateFlow<AccountDeletionUiState> = _state.asStateFlow()

    fun onConfirmationTextChange(value: String) {
        _state.update { it.copy(confirmationText = value, error = null) }
    }

    /**
     * Requests deletion. Inert unless the phrase is confirmed and no request is already in
     * flight (double-tap safe — [AccountDeletionUiState.isDeleting] is set synchronously
     * before the coroutine launches). Always sends the canonical
     * [AccountDeletionConfirmation.REQUIRED_PHRASE], never the raw buffer.
     */
    fun submit() {
        val snapshot = _state.value
        if (!snapshot.canSubmit) return
        _state.update { it.copy(isDeleting = true, error = null) }
        viewModelScope.launch {
            val result = userRepository.deleteAccount(AccountDeletionConfirmation.REQUIRED_PHRASE)
            _state.update { current ->
                when (result) {
                    is NetworkResult.Success ->
                        current.copy(isDeleting = false, isEmailSent = true, error = null)
                    is NetworkResult.Failure ->
                        current.copy(isDeleting = false, error = result.error.toAccountDeletionError())
                }
            }
        }
    }
}

private fun ApiError.toAccountDeletionError(): AccountDeletionError = when {
    httpStatus == 409 -> AccountDeletionError.ALREADY_PENDING
    code == "NETWORK" -> AccountDeletionError.NETWORK
    else -> AccountDeletionError.GENERIC
}
