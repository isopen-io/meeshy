package me.meeshy.app.auth

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.feature.auth.R
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.EmailGateRequest
import me.meeshy.sdk.auth.EmailVerificationGateController
import me.meeshy.sdk.model.auth.CredentialRefusal
import me.meeshy.sdk.model.auth.EmailVerificationRequest
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

data class EmailGateUiState(
    val request: EmailGateRequest? = null,
    /** Le code est parti : la saisie remplace le bouton « Recevoir le code ». */
    val sent: Boolean = false,
    val isSending: Boolean = false,
    val code: String = "",
    val isSubmitting: Boolean = false,
    @get:StringRes val errorRes: Int? = null,
    val errorMessage: String? = null,
    /** « Code renvoyé ! » après un renvoi réussi. */
    val resendConfirmed: Boolean = false,
) {
    val canSubmit: Boolean get() = code.length >= CODE_LENGTH && !isSubmitting && !isSending

    companion object {
        const val CODE_LENGTH = 6
    }
}

/**
 * La feuille « Validez votre adresse e-mail » (iOS `EmailVerificationGateView` + `ActivationEmailStep`
 * avec `sendsOnAppear`, #8365) : la phrase qui dit POURQUOI, le code qui part dès l'ouverture, sa saisie SUR
 * PLACE. L'utilisateur est déjà connecté : la session que rend la preuve n'est PAS rouverte, seul le compte est
 * relu (`/auth/me`) pour que l'adresse apparaisse prouvée. « Plus tard » ou la feuille glissée tranchent `false` :
 * l'action qui attendait reçoit son refus, le brouillon reste.
 */
@HiltViewModel
class EmailVerificationGateViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val gate: EmailVerificationGateController,
) : ViewModel() {

    private val _state = MutableStateFlow(EmailGateUiState())
    val state: StateFlow<EmailGateUiState> = _state.asStateFlow()

    /** Ouvre une demande : le code part dès l'ouverture, une seule fois par demande. */
    fun begin(request: EmailGateRequest) {
        if (_state.value.request == request) return
        _state.value = EmailGateUiState(request = request)
        sendCode()
    }

    fun sendCode() {
        val current = _state.value
        val request = current.request ?: return
        if (current.isSending || current.isSubmitting) return
        _state.update { it.copy(isSending = true, errorRes = null, errorMessage = null, resendConfirmed = false) }
        viewModelScope.launch {
            val result = authRepository.resendEmailVerification(request.email)
            _state.update {
                when (result) {
                    is NetworkResult.Success ->
                        it.copy(isSending = false, sent = true, resendConfirmed = it.sent)
                    is NetworkResult.Failure ->
                        it.copy(isSending = false, errorRes = refusalRes(result.error.code, result.error.httpStatus, resend = true))
                }
            }
        }
    }

    fun onCodeChange(value: String) {
        _state.update {
            it.copy(
                code = value.filter(Char::isDigit).take(EmailGateUiState.CODE_LENGTH),
                errorRes = null,
                errorMessage = null,
                resendConfirmed = false,
            )
        }
    }

    fun verify() {
        val current = _state.value
        val request = current.request ?: return
        if (!current.canSubmit) return
        _state.update { it.copy(isSubmitting = true, errorRes = null, errorMessage = null) }
        viewModelScope.launch {
            when (val result = authRepository.confirmEmail(EmailVerificationRequest.code(code = current.code, email = request.email))) {
                is NetworkResult.Success -> {
                    authRepository.restoreSession()
                    _state.update { it.copy(isSubmitting = false) }
                    gate.settle(true)
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(
                        isSubmitting = false,
                        errorRes = refusalRes(result.error.code, result.error.httpStatus, resend = false),
                    )
                }
            }
        }
    }

    /** « Plus tard » : la demande est tranchée `false`. */
    fun later() {
        gate.settle(false)
    }

    @StringRes
    private fun refusalRes(code: String?, httpStatus: Int?, resend: Boolean): Int =
        when (CredentialRefusal.classify(code, httpStatus)) {
            CredentialRefusal.OFFLINE -> R.string.email_verification_error_offline
            CredentialRefusal.TOO_MANY_ATTEMPTS -> R.string.email_verification_error_too_many_attempts
            CredentialRefusal.INVALID_CODE -> R.string.email_verification_error_invalid_code
            CredentialRefusal.EXPIRED_CODE -> R.string.email_verification_error_expired_code
            CredentialRefusal.REJECTED, CredentialRefusal.UNEXPECTED ->
                if (resend) R.string.email_verification_error_resend_failed else R.string.email_verification_error_generic
        }
}
