package me.meeshy.app.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.LoginHandoffs
import me.meeshy.sdk.model.auth.EmailRecoveryInput
import me.meeshy.sdk.model.auth.EmailRecoveryState
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

data class ForgotPasswordUiState(
    val email: String = "",
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    val recovery: EmailRecoveryState = EmailRecoveryState.INITIAL,
) {
    val canSend: Boolean get() = !isSubmitting && EmailRecoveryInput.canSend(email)
}

/**
 * Mot de passe oublie par email — port de `MeeshyForgotPasswordView` (iOS), volet
 * email. Le gateway repond TOUJOURS succes (anti-enumeration) : l'ecran passe en
 * etat "envoye" des que le transport aboutit, jamais "cet email n'existe pas".
 */
@HiltViewModel
class ForgotPasswordViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    loginHandoffs: LoginHandoffs = LoginHandoffs(),
) : ViewModel() {

    /** L'adresse tapée dans l'identifiant de la connexion l'attend ici (iOS `MeeshyForgotPasswordView(prefilledEmail:)`). */
    private val _state = MutableStateFlow(ForgotPasswordUiState(email = loginHandoffs.recoveryEmail.take().orEmpty()))
    val state: StateFlow<ForgotPasswordUiState> = _state.asStateFlow()

    fun setEmail(value: String) {
        _state.update { it.copy(email = value, errorMessage = null) }
    }

    fun send() {
        val email = _state.value.email.trim()
        if (!_state.value.canSend) return
        _state.update { it.copy(isSubmitting = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = authRepository.requestPasswordReset(email)) {
                is NetworkResult.Success -> _state.update {
                    it.copy(isSubmitting = false, recovery = it.recovery.onSent(email))
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(isSubmitting = false, errorMessage = result.error.message)
                }
            }
        }
    }
}
