package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ChangePasswordForm
import me.meeshy.sdk.model.ChangePasswordValidation
import me.meeshy.sdk.model.PasswordStrength
import me.meeshy.sdk.model.PasswordStrengthLevel
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/** The reason a change-password submit failed — localized by the screen, not the VM. */
enum class ChangePasswordError { INCORRECT_CURRENT, NETWORK, GENERIC }

data class ChangePasswordUiState(
    val currentPassword: String = "",
    val newPassword: String = "",
    val confirmPassword: String = "",
    val isSaving: Boolean = false,
    val isSuccess: Boolean = false,
    val error: ChangePasswordError? = null,
) {
    /** The live strength band of the new password (empty ⇒ TOO_WEAK). */
    val strength: PasswordStrengthLevel
        get() = PasswordStrength.evaluate(newPassword)

    /** Per-rule validation for the hint rows. */
    val validation: ChangePasswordValidation
        get() = ChangePasswordForm.validate(currentPassword, newPassword, confirmPassword)

    /** Whether the submit button may fire — every rule met and no request in flight. */
    val canSubmit: Boolean
        get() = validation.canSubmit && !isSaving
}

/**
 * Drives the change-password screen (feature-parity §L). Holds the three editor
 * buffers, derives the live strength meter and per-rule validation off the pure
 * [PasswordStrength] / [ChangePasswordForm] SSOTs, and performs the single online
 * submit through [UserRepository.changePassword]. On success the buffers are cleared
 * (never retain plaintext) and [ChangePasswordUiState.isSuccess] flips so the screen
 * can confirm and dismiss; a failure maps to a targeted [ChangePasswordError] the
 * screen localizes.
 */
@HiltViewModel
class ChangePasswordViewModel @Inject constructor(
    private val userRepository: UserRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ChangePasswordUiState())
    val state: StateFlow<ChangePasswordUiState> = _state.asStateFlow()

    fun onCurrentPasswordChange(value: String) {
        _state.update { it.copy(currentPassword = value, error = null) }
    }

    fun onNewPasswordChange(value: String) {
        _state.update { it.copy(newPassword = value, error = null) }
    }

    fun onConfirmPasswordChange(value: String) {
        _state.update { it.copy(confirmPassword = value, error = null) }
    }

    /**
     * Submits the change. Inert unless every gate is satisfied and no request is
     * already in flight (double-tap safe — the [ChangePasswordUiState.isSaving] flag
     * is set synchronously before the coroutine launches).
     */
    fun submit() {
        val snapshot = _state.value
        if (!snapshot.canSubmit) return
        _state.update { it.copy(isSaving = true, error = null) }
        viewModelScope.launch {
            val result = userRepository.changePassword(
                currentPassword = snapshot.currentPassword,
                newPassword = snapshot.newPassword,
            )
            _state.update { current ->
                when (result) {
                    is NetworkResult.Success -> ChangePasswordUiState(isSuccess = true)
                    is NetworkResult.Failure ->
                        current.copy(isSaving = false, error = result.error.toChangePasswordError())
                }
            }
        }
    }
}

private fun ApiError.toChangePasswordError(): ChangePasswordError = when {
    httpStatus == 400 -> ChangePasswordError.INCORRECT_CURRENT
    code == "NETWORK" -> ChangePasswordError.NETWORK
    else -> ChangePasswordError.GENERIC
}
