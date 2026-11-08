package me.meeshy.app.contacts

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.account.PhoneChangeFlow
import me.meeshy.sdk.model.auth.PhonePlausibility
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/** Pourquoi l'envoi ou la vérification a échoué : le texte est choisi par l'écran (localisé). */
enum class PhonePromptError { SEND_FAILED, CODE_INVALID, GENERIC }

@Immutable
data class PhonePromptUiState(
    val flow: PhoneChangeFlow = PhoneChangeFlow(),
    val isSending: Boolean = false,
    val isVerifying: Boolean = false,
    val error: PhonePromptError? = null,
) {
    val isCodeStep: Boolean get() = flow.isCodeSent
    val canSend: Boolean get() = flow.canSendCode && !isSending
    val canVerify: Boolean get() = flow.canVerify && !isVerifying
    val refusal: PhonePlausibility.Refusal? get() = flow.numberRefusal
}

sealed interface PhonePromptEvent {
    data class NumberChanged(val value: String) : PhonePromptEvent
    data class CodeChanged(val value: String) : PhonePromptEvent
    data object SendCode : PhonePromptEvent
    data object VerifyCode : PhonePromptEvent
    data object EditNumber : PhonePromptEvent
}

sealed interface PhonePromptEffect {
    data object HapticSuccess : PhonePromptEffect
    data object HapticError : PhonePromptEffect

    /** Numéro vérifié : la feuille se ferme d'elle-même (le flux SMS est terminé). */
    data object Verified : PhonePromptEffect
}

/**
 * Feuille « Ajoute ton numéro » (#8843), miroir de `PhonePromptSheet` + `PhoneChangeFlowModel` :
 * la machine d'état est [PhoneChangeFlow], la MÊME que celle de Paramètres > Compte. Jamais
 * bloquante : [onClosed] relance la recherche de contacts quelle que soit la cause de la
 * fermeture (vérifié, « Plus tard », balayage), une seule fois.
 */
@HiltViewModel
class PhonePromptViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val sessionRepository: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(PhonePromptUiState(flow = PhoneChangeFlow().beginEdit(null)))
    val state: StateFlow<PhonePromptUiState> = _state.asStateFlow()

    private val _effects = Channel<PhonePromptEffect>(Channel.BUFFERED)
    val effects: Flow<PhonePromptEffect> = _effects.receiveAsFlow()

    private var continued = false

    fun onEvent(event: PhonePromptEvent) = when (event) {
        is PhonePromptEvent.NumberChanged ->
            _state.update { it.copy(flow = it.flow.onNumberChange(event.value), error = null) }
        is PhonePromptEvent.CodeChanged ->
            _state.update { it.copy(flow = it.flow.onCodeChange(event.value), error = null) }
        PhonePromptEvent.EditNumber ->
            _state.update { it.copy(flow = it.flow.back(), error = null) }
        PhonePromptEvent.SendCode -> sendCode()
        PhonePromptEvent.VerifyCode -> verifyCode()
    }

    /** Appelée par TOUTE fermeture de la feuille ; [onContinue] ne s'exécute qu'une fois. */
    fun onClosed(onContinue: () -> Unit) {
        if (continued) return
        continued = true
        onContinue()
    }

    private fun sendCode() {
        val snapshot = _state.value
        if (!snapshot.canSend) return
        _state.update { it.copy(isSending = true, error = null) }
        viewModelScope.launch {
            when (userRepository.changePhone(snapshot.flow.number.trim())) {
                is NetworkResult.Success -> {
                    _state.update { it.copy(isSending = false, flow = it.flow.codeSent()) }
                    _effects.trySend(PhonePromptEffect.HapticSuccess)
                }
                is NetworkResult.Failure -> {
                    _state.update { it.copy(isSending = false, error = PhonePromptError.SEND_FAILED) }
                    _effects.trySend(PhonePromptEffect.HapticError)
                }
            }
        }
    }

    private fun verifyCode() {
        val snapshot = _state.value
        if (!snapshot.canVerify) return
        _state.update { it.copy(isVerifying = true, error = null) }
        viewModelScope.launch {
            when (val result = userRepository.verifyPhoneChange(snapshot.flow.code)) {
                is NetworkResult.Success -> {
                    sessionRepository.refresh()
                    _state.update { it.copy(isVerifying = false, flow = it.flow.verified()) }
                    _effects.trySend(PhonePromptEffect.HapticSuccess)
                    _effects.trySend(PhonePromptEffect.Verified)
                }
                is NetworkResult.Failure -> {
                    val kind = if (result.error.httpStatus == 400) PhonePromptError.CODE_INVALID else PhonePromptError.GENERIC
                    _state.update { it.copy(isVerifying = false, error = kind) }
                    _effects.trySend(PhonePromptEffect.HapticError)
                }
            }
        }
    }
}
