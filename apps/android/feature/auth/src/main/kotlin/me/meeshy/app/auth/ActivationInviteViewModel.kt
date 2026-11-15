package me.meeshy.app.auth

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.ActivationInviteDayStore
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.game.OnboardingPresence
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserActivation.Channel as ProofChannel
import me.meeshy.sdk.model.auth.ActivationInvitePolicy
import me.meeshy.sdk.model.auth.ActivationInviteState
import me.meeshy.sdk.model.auth.EmailProofError
import me.meeshy.sdk.model.auth.EmailVerificationRequest
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.OtpCodeField
import me.meeshy.sdk.model.auth.OtpVerificationGate
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository

/** La feuille « Validez votre compte » et sa saisie du code sur place. */
@Immutable
data class ActivationInviteUiState(
    val invite: ActivationInviteState = ActivationInviteState(),
    val daysLeft: Int? = null,
    /** Le code est parti : la saisie remplace « Recevoir le code ». */
    val emailSent: Boolean = false,
    val code: String = "",
    val gate: OtpVerificationGate = OtpVerificationGate(),
    val error: EmailProofError? = null,
) {
    val isPresented: Boolean get() = invite.isPresented
}

sealed interface ActivationInviteEvent {
    data class UserChanged(val user: MeeshyUser?, val onboardingVisible: Boolean) : ActivationInviteEvent
    data class Prove(val channel: ProofChannel) : ActivationInviteEvent
    data object SendCode : ActivationInviteEvent
    data class CodeChanged(val value: String) : ActivationInviteEvent
    data object Verify : ActivationInviteEvent
    data object AddPhone : ActivationInviteEvent
    data object Dismiss : ActivationInviteEvent
}

sealed interface ActivationInviteEffect {
    /** Ouvre Parametres > Compte (section telephone). */
    data object OpenPhoneSettings : ActivationInviteEffect
}

/**
 * « Validez votre compte » (#8239, loi serveur #8238) — de J7 a J28, un compte a l'adresse non prouvee est invite,
 * a l'ouverture de l'app, a la prouver et a ajouter un numero, sans quitter l'app. Miroir de
 * `ActivationInviteViewModel` (iOS).
 *
 * Ouverte au plus UNE fois par jour civil local et par appareil (le jour est retenu des l'ouverture), jamais
 * pendant l'onboarding. Ouverte, elle ABSORBE les preuves qui arrivent par l'utilisateur courant au lieu de se
 * rouvrir ; la deconnexion la ferme.
 */
@HiltViewModel
class ActivationInviteViewModel internal constructor(
    private val authRepository: AuthRepository,
    private val dayStore: ActivationInviteDayStore,
    private val now: () -> Long,
    sessions: Flow<MeeshyUser?>,
    onboarding: Flow<Boolean>,
) : ViewModel() {

    @Inject
    constructor(
        authRepository: AuthRepository,
        dayStore: ActivationInviteDayStore,
        sessions: SessionRepository,
        onboarding: OnboardingPresence,
    ) : this(authRepository, dayStore, System::currentTimeMillis, sessions.currentUser, onboarding.isPresented)

    private val _state = MutableStateFlow(ActivationInviteUiState())
    val state: StateFlow<ActivationInviteUiState> = _state

    private val _effects = Channel<ActivationInviteEffect>(Channel.BUFFERED)
    val effects: Flow<ActivationInviteEffect> = _effects.receiveAsFlow()

    init {
        viewModelScope.launch {
            combine(sessions, onboarding) { user, covered -> user to covered }.collect { (user, covered) ->
                onUserChanged(user, covered)
            }
        }
    }

    fun onEvent(event: ActivationInviteEvent) {
        when (event) {
            is ActivationInviteEvent.UserChanged -> viewModelScope.launch { onUserChanged(event.user, event.onboardingVisible) }
            is ActivationInviteEvent.Prove -> prove(event.channel)
            ActivationInviteEvent.SendCode -> sendCode()
            is ActivationInviteEvent.CodeChanged -> _state.update {
                it.copy(code = OtpCodeField.sanitize(event.value), error = null)
            }
            ActivationInviteEvent.Verify -> verify()
            ActivationInviteEvent.AddPhone -> {
                _effects.trySend(ActivationInviteEffect.OpenPhoneSettings)
                dismiss()
            }
            ActivationInviteEvent.Dismiss -> dismiss()
        }
    }

    private suspend fun onUserChanged(user: MeeshyUser?, onboardingVisible: Boolean) {
        if (user == null) {
            dismiss()
            return
        }
        if (onboardingVisible) return
        if (_state.value.isPresented) {
            _state.update { it.withInvite(ActivationInvitePolicy.absorb(it.invite, user)) }
            return
        }
        val at = now()
        if (!ActivationInvitePolicy.shouldOpen(user, dayStore.wasShownToday(at), onboardingVisible = false)) return
        dayStore.markShown(at)
        _state.value = ActivationInviteUiState().withInvite(ActivationInvitePolicy.open(user))
    }

    private fun prove(channel: ProofChannel) {
        _state.update { it.withInvite(ActivationInvitePolicy.prove(it.invite, channel)) }
    }

    private fun dismiss() {
        _state.update { it.copy(invite = it.invite.copy(isPresented = false)) }
    }

    private fun sendCode() {
        val current = _state.value
        val email = current.invite.email ?: return
        if (current.gate.isResending) return
        _state.update { it.copy(gate = it.gate.copy(isResending = true), error = null) }
        viewModelScope.launch {
            val result = authRepository.resendEmailVerification(email)
            _state.update {
                when (result) {
                    is NetworkResult.Success -> it.copy(gate = it.gate.copy(isResending = false), emailSent = true)
                    is NetworkResult.Failure -> it.copy(
                        gate = it.gate.copy(isResending = false),
                        error = EmailProofError.forResend(result.error.code, result.error.httpStatus),
                    )
                }
            }
        }
    }

    private fun verify() {
        val current = _state.value
        val email = current.invite.email ?: return
        if (!current.gate.canVerify(current.code)) return
        _state.update { it.copy(gate = it.gate.copy(isVerifying = true), error = null) }
        viewModelScope.launch {
            when (val result = authRepository.confirmEmail(EmailVerificationRequest.code(code = current.code, email = email))) {
                is NetworkResult.Success -> {
                    (result.data as? LoginOutcome.Authenticated)?.session?.let {
                        authRepository.closeProvenServerSession(it.token, it.sessionToken)
                    }
                    authRepository.restoreSession()
                    _state.update {
                        it.copy(gate = it.gate.copy(isVerifying = false), code = "", emailSent = false)
                            .withInvite(ActivationInvitePolicy.prove(it.invite, ProofChannel.EMAIL))
                    }
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(
                        gate = it.gate.copy(isVerifying = false),
                        error = EmailProofError.forVerification(result.error.code, result.error.httpStatus),
                    )
                }
            }
        }
    }

    private fun ActivationInviteUiState.withInvite(next: ActivationInviteState): ActivationInviteUiState =
        copy(invite = next, daysLeft = next.daysLeft(now()))
}
