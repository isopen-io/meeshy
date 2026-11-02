package me.meeshy.app.auth

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.auth.PasswordResetFlow
import me.meeshy.sdk.model.auth.PasswordResetOutcome
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

data class NewPasswordUiState(
    val flow: PasswordResetFlow = PasswordResetFlow(),
    val newPassword: String = "",
    val confirmPassword: String = "",
    val code: String = "",
    val isLoading: Boolean = false,
) {
    val canSubmit: Boolean
        get() = !isLoading && flow.phase == PasswordResetFlow.Phase.FORM && flow.canSubmit(newPassword, confirmPassword, code)

    val showsMismatch: Boolean get() = confirmPassword.isNotEmpty() && newPassword != confirmPassword
}

/**
 * « Nouveau mot de passe » — port de `MeeshyNewPasswordView` (iOS). Le jeton du lien de l'e-mail désigne son compte,
 * pas la session : connecté ou non, l'écran fait la même chose.
 *
 * Le jeton n'est lu qu'UNE fois, de l'argument de navigation, et RETIRÉ de l'état sauvegardé aussitôt : il ne survit
 * ni à la mort du processus ni à une restauration (l'écran restauré affiche alors un lien mort, jamais un jeton relu).
 * Il n'est jamais journalisé (`SensitiveBodyLoggingGuard` couvre la route), jamais écrit sur le disque, et ne sert
 * qu'une fois : une fois le mot de passe enregistré, plus aucun envoi ne part. Rien du mot de passe ne reste en
 * mémoire une fois qu'il est enregistré ou que le lien est mort.
 */
@HiltViewModel
class NewPasswordViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val token: String? = savedStateHandle.remove<String>(TOKEN_ARG)?.takeIf { it.isNotBlank() }

    private val _state = MutableStateFlow(
        NewPasswordUiState(
            flow = if (token == null) PasswordResetFlow(phase = PasswordResetFlow.Phase.LINK_INVALID) else PasswordResetFlow(),
        ),
    )
    val state: StateFlow<NewPasswordUiState> = _state.asStateFlow()

    init {
        verifyToken()
    }

    fun onNewPasswordChange(value: String) = _state.update { it.copy(newPassword = value) }

    fun onConfirmPasswordChange(value: String) = _state.update { it.copy(confirmPassword = value) }

    fun onCodeChange(value: String) = _state.update { it.copy(code = PasswordResetFlow.sanitizedCode(value)) }

    /** Le verdict du jeton, sans le consommer. Une panne laisse le formulaire : c'est l'envoi qui dira la vérité (iOS). */
    private fun verifyToken() {
        val held = token ?: return
        viewModelScope.launch {
            val result = authRepository.verifyResetToken(held)
            if (result is NetworkResult.Success) {
                _state.update { it.copy(flow = it.flow.verified(result.data)) }
            }
        }
    }

    fun submit() {
        val held = token ?: return
        val current = _state.value
        if (!current.canSubmit) return
        _state.update { it.copy(isLoading = true, flow = it.flow.clearingNotice()) }
        viewModelScope.launch {
            val result = authRepository.submitPasswordReset(
                token = held,
                newPassword = current.newPassword,
                twoFactorCode = current.flow.submittedCode(current.code),
            )
            val outcome = when (result) {
                is NetworkResult.Success -> PasswordResetOutcome.Saved
                is NetworkResult.Failure -> PasswordResetOutcome.of(result.error.httpStatus, result.error.code, result.error.message)
            }
            _state.update { settle(it, outcome) }
        }
    }

    private fun settle(state: NewPasswordUiState, outcome: PasswordResetOutcome): NewPasswordUiState {
        val flow = state.flow.resolved(outcome)
        val staysOnForm = flow.phase == PasswordResetFlow.Phase.FORM
        return state.copy(
            flow = flow,
            isLoading = false,
            newPassword = if (staysOnForm) state.newPassword else "",
            confirmPassword = if (staysOnForm) state.confirmPassword else "",
            code = if (staysOnForm && outcome != PasswordResetOutcome.SecondFactorInvalid) state.code else "",
        )
    }

    companion object {
        const val TOKEN_ARG: String = "token"
    }
}
