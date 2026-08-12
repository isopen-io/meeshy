package me.meeshy.app.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.auth.EmailRecoveryInput
import me.meeshy.sdk.model.auth.EmailRecoveryState
import me.meeshy.sdk.model.auth.MagicLinkCountdown
import me.meeshy.sdk.model.auth.MagicLinkEmail
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
) : ViewModel() {

    private val _state = MutableStateFlow(ForgotPasswordUiState())
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

data class MagicLinkUiState(
    val email: String = "",
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    val sentTo: String? = null,
    val countdown: MagicLinkCountdown? = null,
) {
    val canSend: Boolean get() = !isSubmitting && MagicLinkEmail.isValid(email.trim())
    val canResend: Boolean get() = countdown?.canResend(isSubmitting) == true
}

/**
 * Connexion par magic link — port de `MagicLinkView` (iOS) : demande du lien puis
 * compte a rebours 1 s ([MagicLinkCountdown], transitions pures testees) jusqu'a
 * expiration, ou le renvoi se debloque. La connexion elle-meme aboutit par le lien
 * recu par email.
 */
@HiltViewModel
class MagicLinkViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(MagicLinkUiState())
    val state: StateFlow<MagicLinkUiState> = _state.asStateFlow()

    private var tickJob: Job? = null

    fun setEmail(value: String) {
        _state.update { it.copy(email = value, errorMessage = null) }
    }

    fun send() {
        val email = _state.value.email.trim()
        if (!_state.value.canSend && _state.value.sentTo == null) return
        _state.update { it.copy(isSubmitting = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = authRepository.requestMagicLink(email)) {
                is NetworkResult.Success -> {
                    _state.update {
                        it.copy(
                            isSubmitting = false,
                            sentTo = email,
                            countdown = MagicLinkCountdown.start(result.data),
                        )
                    }
                    startTicking()
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(isSubmitting = false, errorMessage = result.error.message)
                }
            }
        }
    }

    private fun startTicking() {
        tickJob?.cancel()
        tickJob = viewModelScope.launch {
            while (true) {
                delay(1000)
                val ticked = _state.value.countdown?.tick() ?: break
                _state.update { it.copy(countdown = ticked) }
                if (ticked.expired) break
            }
        }
    }
}
