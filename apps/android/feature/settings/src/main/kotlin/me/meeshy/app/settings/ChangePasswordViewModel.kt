package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.ChangePasswordForm
import me.meeshy.sdk.model.ChangePasswordValidation
import me.meeshy.sdk.model.PasswordStrength
import me.meeshy.sdk.model.PasswordStrengthLevel
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/** The reason a change-password submit failed — localized by the screen, not the VM. */
enum class ChangePasswordError { INCORRECT_CURRENT, WEAK, REJECTED, NETWORK, GENERIC }

/** Effets ponctuels : la fermeture automatique, 1,5 s après le succès (iOS `cancellableSleep`). */
sealed interface ChangePasswordEffect {
    data object Close : ChangePasswordEffect
}

internal const val CHANGE_PASSWORD_AUTO_CLOSE_MILLIS = 1_500L

data class ChangePasswordUiState(
    val currentPassword: String = "",
    val newPassword: String = "",
    val confirmPassword: String = "",
    val isSaving: Boolean = false,
    val isSuccess: Boolean = false,
    val error: ChangePasswordError? = null,
    /** `null` tant que la lecture n'a pas répondu ou a échoué : le champ « actuel » reste demandé. */
    val hasPassword: Boolean? = null,
) {
    /** Le champ « mot de passe actuel » n'est masqué que si le compte n'a PAS de mot de passe. */
    val asksCurrentPassword: Boolean
        get() = ChangePasswordForm.asksCurrentPassword(hasPassword)

    /** The live strength band of the new password (empty ⇒ TOO_WEAK). */
    val strength: PasswordStrengthLevel
        get() = PasswordStrength.evaluate(newPassword)

    /** Per-rule validation for the hint rows. */
    val validation: ChangePasswordValidation
        get() = ChangePasswordForm.validate(currentPassword, newPassword, confirmPassword, hasPassword)

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
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ChangePasswordUiState())
    val state: StateFlow<ChangePasswordUiState> = _state.asStateFlow()

    private val _effects = Channel<ChangePasswordEffect>(Channel.BUFFERED)
    val effects: Flow<ChangePasswordEffect> = _effects.receiveAsFlow()

    init {
        viewModelScope.launch {
            val known = when (val result = authRepository.hasPassword()) {
                is NetworkResult.Success -> result.data
                is NetworkResult.Failure -> null
            }
            _state.update { it.copy(hasPassword = known) }
        }
    }

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
                currentPassword = ChangePasswordForm.submittedCurrent(snapshot.currentPassword, snapshot.hasPassword),
                newPassword = snapshot.newPassword,
            )
            _state.update { current ->
                when (result) {
                    is NetworkResult.Success -> ChangePasswordUiState(isSuccess = true, hasPassword = current.hasPassword)
                    is NetworkResult.Failure -> {
                        current.copy(
                            isSaving = false,
                            error = result.error.toChangePasswordError(snapshot.asksCurrentPassword),
                        )
                    }
                }
            }
            if (result is NetworkResult.Success) {
                delay(CHANGE_PASSWORD_AUTO_CLOSE_MILLIS)
                _effects.send(ChangePasswordEffect.Close)
            }
        }
    }
}

private const val CODE_CURRENT_PASSWORD_INCORRECT = "CURRENT_PASSWORD_INCORRECT"
private const val CODE_PASSWORD_TOO_WEAK = "PASSWORD_TOO_WEAK"
private const val LEGACY_MESSAGE_CURRENT_INCORRECT = "Current password is incorrect"
private const val LEGACY_MESSAGE_TOO_WEAK_PREFIX = "Password requirements:"

/**
 * Décide sur le `code` de la passerelle quand il existe. Une passerelle d'avant ces codes ne sert
 * que `HTTP_400` : on retombe alors sur son message EXACT. Tout autre 400 est un refus générique —
 * jamais « actuel incorrect », que le serveur n'a pas dit.
 */
private fun ApiError.toChangePasswordError(asksCurrentPassword: Boolean): ChangePasswordError {
    if (code == "NETWORK") return ChangePasswordError.NETWORK
    if (httpStatus != 400) return ChangePasswordError.GENERIC
    val legacy = code == null || code == "HTTP_400"
    return when {
        code == CODE_PASSWORD_TOO_WEAK -> ChangePasswordError.WEAK
        legacy && message.startsWith(LEGACY_MESSAGE_TOO_WEAK_PREFIX) -> ChangePasswordError.WEAK
        !asksCurrentPassword -> ChangePasswordError.REJECTED
        code == CODE_CURRENT_PASSWORD_INCORRECT -> ChangePasswordError.INCORRECT_CURRENT
        legacy && message == LEGACY_MESSAGE_CURRENT_INCORRECT -> ChangePasswordError.INCORRECT_CURRENT
        else -> ChangePasswordError.REJECTED
    }
}
