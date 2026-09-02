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
import me.meeshy.sdk.net.api.AccountDeletionApi
import javax.inject.Inject

/** The reason an account-deletion request failed — localized by the screen, not the VM. */
enum class AccountDeletionError { INVALID_PASSWORD, ALREADY_PENDING, NO_EMAIL, NETWORK, GENERIC }

data class AccountDeletionUiState(
    val confirmationText: String = "",
    val currentPassword: String = "",
    val isDeleting: Boolean = false,
    val isEmailSent: Boolean = false,
    val error: AccountDeletionError? = null,
) {
    /** Whether the typed phrase matches the gateway literal verbatim. */
    val isConfirmed: Boolean
        get() = AccountDeletionConfirmation.isConfirmed(confirmationText)

    /** Whether the delete button may fire — phrase confirmed, a password was typed, and
     *  no request is in flight. */
    val canSubmit: Boolean
        get() = isConfirmed && currentPassword.isNotEmpty() && !isDeleting
}

/**
 * Drives the account-deletion screen (feature-parity §L, port of iOS `DeleteAccountView`).
 * Holds the confirmation and password buffers, gates the destructive submit behind the
 * verbatim [AccountDeletionConfirmation] phrase plus a non-empty password, and performs
 * the single online [AccountDeletionApi.open] call — the modern
 * `POST /me/account/deletion` route, which requires the caller's CURRENT password on top
 * of the confirmation phrase (#4183, #4799): a stolen JWT alone can no longer open a
 * deletion request. The gateway does **not** delete immediately — it opens a 90-day grace
 * period and mails a confirmation link — so on success the VM flips
 * [AccountDeletionUiState.isEmailSent] (no logout, no session teardown; the screen shows a
 * "check your inbox" state). A failure maps to a targeted [AccountDeletionError] the screen
 * localizes (`401` = wrong password; `409` = a deletion is already pending; transport =
 * network; else generic).
 *
 * Calls [AccountDeletionApi] (`core/network`) directly rather than going through
 * `UserRepository` (`sdk-core`) — this lot's perimeter is `feature/settings` +
 * `core/network` only (#4799); folding this call into `UserRepository` for consistency
 * with the rest of the app is a natural, low-risk follow-up outside that boundary.
 */
@HiltViewModel
class AccountDeletionViewModel @Inject constructor(
    private val accountDeletionApi: AccountDeletionApi,
) : ViewModel() {

    private val _state = MutableStateFlow(AccountDeletionUiState())
    val state: StateFlow<AccountDeletionUiState> = _state.asStateFlow()

    fun onConfirmationTextChange(value: String) {
        _state.update { it.copy(confirmationText = value, error = null) }
    }

    fun onCurrentPasswordChange(value: String) {
        _state.update { it.copy(currentPassword = value, error = null) }
    }

    /**
     * Requests deletion. Inert unless the phrase is confirmed, a password was typed, and
     * no request is already in flight (double-tap safe — [AccountDeletionUiState.isDeleting]
     * is set synchronously before the coroutine launches). Always sends the canonical
     * [AccountDeletionConfirmation.REQUIRED_PHRASE], never the raw buffer.
     */
    fun submit() {
        val snapshot = _state.value
        if (!snapshot.canSubmit) return
        _state.update { it.copy(isDeleting = true, error = null) }
        viewModelScope.launch {
            val result = accountDeletionApi.open(
                confirmationPhrase = AccountDeletionConfirmation.REQUIRED_PHRASE,
                currentPassword = snapshot.currentPassword,
            )
            _state.update { current ->
                when (result) {
                    is NetworkResult.Success ->
                        // The password's only consumer was this request; nothing downstream
                        // reads it again once the "check your inbox" state is showing.
                        current.copy(
                            isDeleting = false,
                            isEmailSent = true,
                            error = null,
                            currentPassword = "",
                        )
                    is NetworkResult.Failure -> {
                        val error = result.error.toAccountDeletionError()
                        current.copy(
                            isDeleting = false,
                            error = error,
                            // A rejected password (right or wrong) should not linger in memory —
                            // force a fresh keystroke rather than resubmitting a stale buffer.
                            currentPassword = if (error == AccountDeletionError.INVALID_PASSWORD) "" else current.currentPassword,
                        )
                    }
                }
            }
        }
    }
}

/**
 * `/me/account/deletion` answers 409 for TWO unrelated reasons — an already-pending
 * deletion request, and a wrong-confirmation/no-email precondition
 * (`services/gateway/src/routes/me/delete-account.ts`, `NO_EMAIL`) — so the gateway's
 * `code` must be checked BEFORE falling back to the bare [ApiError.httpStatus]: relying
 * on status alone (the prior behaviour) reported every `NO_EMAIL` 409 as
 * [AccountDeletionError.ALREADY_PENDING], leaving the user waiting on a deletion
 * request that was never created.
 */
private fun ApiError.toAccountDeletionError(): AccountDeletionError = when {
    httpStatus == 401 -> AccountDeletionError.INVALID_PASSWORD
    code == "NO_EMAIL" -> AccountDeletionError.NO_EMAIL
    httpStatus == 409 -> AccountDeletionError.ALREADY_PENDING
    code == "NETWORK" -> AccountDeletionError.NETWORK
    else -> AccountDeletionError.GENERIC
}
