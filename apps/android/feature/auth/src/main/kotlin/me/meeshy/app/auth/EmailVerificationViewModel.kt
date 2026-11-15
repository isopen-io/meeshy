package me.meeshy.app.auth

import androidx.annotation.StringRes
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.feature.auth.R
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.EmailVerificationWatcher
import me.meeshy.sdk.model.auth.EmailProofError
import me.meeshy.sdk.model.auth.EmailVerificationLead
import me.meeshy.sdk.model.auth.EmailVerificationRequest
import me.meeshy.sdk.model.auth.EmailVerificationWatchPolicy
import me.meeshy.sdk.model.auth.EmailVerificationWatchStatus
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.OtpCodeField
import me.meeshy.sdk.model.auth.OtpVerificationGate
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

@Immutable
data class EmailVerificationUiState(
    val email: String = "",
    val lead: EmailVerificationLead = EmailVerificationLead.CODE_SENT,
    val code: String = "",
    val isVerifying: Boolean = false,
    val isResending: Boolean = false,
    /** « Code renvoyé ! » pendant 3 s. */
    val resendConfirmed: Boolean = false,
    /** « Email vérifié ! » : la coche animée avant l'ouverture de la session. */
    val verified: Boolean = false,
    /** L'adresse a été prouvée AILLEURS : le bandeau le dit, ce téléphone n'entre que par son code. */
    val provenElsewhere: Boolean = false,
    val error: EmailProofError? = null,
) {
    val gate: OtpVerificationGate
        get() = OtpVerificationGate(isVerifying, isResending, resendConfirmed, verified)
}

sealed interface EmailVerificationEvent {
    data class CodeChanged(val raw: String) : EmailVerificationEvent
    data object Verify : EmailVerificationEvent
    data object Resend : EmailVerificationEvent
    data object WatchStarted : EmailVerificationEvent
    data object WatchStopped : EmailVerificationEvent
}

sealed interface EmailVerificationEffect {
    /**
     * La preuve est faite : l'HÔTE ouvre la session (ou suit le défi de second facteur) une fois la feuille
     * refermée — c'est le point d'accroche `onVerified` auquel la fête d'arrivée se branche.
     */
    data class Verified(val outcome: LoginOutcome) : EmailVerificationEffect
}

@StringRes
fun EmailProofError.messageRes(): Int = when (this) {
    EmailProofError.INVALID_CODE -> R.string.email_verification_error_invalid_code
    EmailProofError.EXPIRED_CODE -> R.string.email_verification_error_expired_code
    EmailProofError.WEAK_PASSWORD -> R.string.email_verification_error_weak_password
    EmailProofError.TOO_MANY_ATTEMPTS -> R.string.email_verification_error_too_many_attempts
    EmailProofError.OFFLINE -> R.string.email_verification_error_offline
    EmailProofError.RESEND_FAILED -> R.string.email_verification_error_resend_failed
    EmailProofError.GENERIC -> R.string.email_verification_error_generic
}

/**
 * La saisie du code reçu par e-mail (iOS `EmailVerificationViewModel`, #8035) : il vérifie l'adresse ET rend
 * l'issue qui ouvre la session. Le mot de passe tapé à la connexion n'est tenu qu'en MÉMOIRE, oublié dès la
 * preuve. Aucune session n'est posée ici : l'hôte l'ouvre via l'effet [EmailVerificationEffect.Verified].
 */
@HiltViewModel
class EmailVerificationViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val watcher: EmailVerificationWatcher,
) : ViewModel() {

    private val ui = MutableStateFlow(EmailVerificationUiState())
    val state: StateFlow<EmailVerificationUiState> = ui.asStateFlow()

    private val effects = Channel<EmailVerificationEffect>(Channel.BUFFERED)
    val effect = effects.receiveAsFlow()

    private var password: String? = null
    private var pendingSessionToken: String? = null
    private var watchJob: Job? = null
    private var begun = false

    /** Pose l'adresse à prouver ; sans effet si la même est déjà en cours. */
    fun begin(email: String, password: String?, accountCreated: Boolean, pendingSessionToken: String?) {
        if (begun && ui.value.email == email) return
        begun = true
        this.password = password?.takeIf { it.isNotEmpty() }
        this.pendingSessionToken = pendingSessionToken
        ui.value = EmailVerificationUiState(
            email = email,
            lead = EmailVerificationLead.from(accountCreated, passwordProven = this.password != null),
        )
    }

    /**
     * Un nouvel envoi à la même adresse (« Renvoyer ») a un nouveau jeton d'attente : la veille repart avec lui, et
     * l'adresse déjà confirmée ailleurs ne le reste pas pour le nouvel envoi (iOS `pendingSessionToken` réassigné).
     */
    fun refreshPendingSessionToken(token: String?) {
        if (token == pendingSessionToken) return
        pendingSessionToken = token
        ui.update { it.copy(provenElsewhere = false) }
        if (watchJob?.isActive == true) startWatching()
    }

    fun onEvent(event: EmailVerificationEvent) {
        when (event) {
            is EmailVerificationEvent.CodeChanged -> onCodeChanged(event.raw)
            EmailVerificationEvent.Verify -> verify()
            EmailVerificationEvent.Resend -> resend()
            EmailVerificationEvent.WatchStarted -> startWatching()
            EmailVerificationEvent.WatchStopped -> watchJob?.cancel()
        }
    }

    private fun onCodeChanged(raw: String) {
        val code = OtpCodeField.sanitize(raw)
        if (code == ui.value.code) return
        ui.update { it.copy(code = code, error = null) }
        if (ui.value.gate.canVerify(code)) verify()
    }

    private fun startWatching() {
        val token = pendingSessionToken ?: return
        val current = ui.value
        if (current.provenElsewhere || current.verified) return
        watchJob?.cancel()
        watchJob = viewModelScope.launch {
            watcher.watch(token).collect { status ->
                if (status == EmailVerificationWatchStatus.PROVEN) ui.update { it.copy(provenElsewhere = true) }
            }
        }
    }

    private fun verify() {
        val current = ui.value
        if (!current.gate.canVerify(current.code)) return
        ui.update { it.copy(isVerifying = true, error = null) }
        viewModelScope.launch {
            val request = EmailVerificationRequest.code(current.code, current.email, password)
            when (val result = authRepository.confirmEmail(request)) {
                is NetworkResult.Failure -> ui.update {
                    it.copy(
                        isVerifying = false,
                        error = EmailProofError.forVerification(result.error.code, result.error.httpStatus),
                    )
                }
                is NetworkResult.Success -> proven(result.data)
            }
        }
    }

    private suspend fun proven(outcome: LoginOutcome) {
        watchJob?.cancel()
        when (outcome) {
            is LoginOutcome.Authenticated -> {
                password = null
                ui.update { it.copy(isVerifying = false, verified = true) }
                delay(EmailVerificationWatchPolicy.SUCCESS_PAUSE_MS)
                effects.send(EmailVerificationEffect.Verified(outcome))
            }
            is LoginOutcome.TwoFactorRequired -> {
                password = null
                ui.update { it.copy(isVerifying = false) }
                effects.send(EmailVerificationEffect.Verified(outcome))
            }
            is LoginOutcome.VerificationRequired, is LoginOutcome.LinkConfirmationRequired ->
                ui.update { it.copy(isVerifying = false, error = EmailProofError.GENERIC) }
        }
    }

    private fun resend() {
        val current = ui.value
        if (!current.gate.canResend) return
        ui.update { it.copy(isResending = true, error = null) }
        viewModelScope.launch {
            when (val result = authRepository.resendEmailVerification(current.email)) {
                is NetworkResult.Failure -> ui.update {
                    it.copy(
                        isResending = false,
                        error = EmailProofError.forResend(result.error.code, result.error.httpStatus),
                    )
                }
                is NetworkResult.Success -> {
                    ui.update { it.copy(isResending = false, resendConfirmed = true) }
                    delay(EmailVerificationWatchPolicy.RESEND_CONFIRMATION_MS)
                    ui.update { it.copy(resendConfirmed = false) }
                }
            }
        }
    }
}
