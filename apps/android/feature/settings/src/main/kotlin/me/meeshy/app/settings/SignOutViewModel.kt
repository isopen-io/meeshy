package me.meeshy.app.settings

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
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.settings.LogoutPhase
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import javax.inject.Inject

sealed interface SignOutEffect {
    /** La session est fermée (sockets coupés, caches vidés, trousseau purgé) : on peut quitter l'écran. */
    data object SignedOut : SignOutEffect
}

sealed interface SignOutEvent {
    data object Requested : SignOutEvent
    data object Cancelled : SignOutEvent
    data object Confirmed : SignOutEvent
}

/**
 * iOS `SettingsView` : alerte de confirmation puis `await authManager.logout(forgettingAccount: false)`
 * sous un overlay bloquant. Le compte reste dans `SavedAccountsStore` (la purge ne le touche pas) ;
 * la navigation n'est émise qu'APRÈS le retour de `logout()`.
 */
@HiltViewModel
class SignOutViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val realtimeCoordinator: RealtimeSessionCoordinator,
) : ViewModel() {

    private val _phase = MutableStateFlow(LogoutPhase.Idle)
    val phase: StateFlow<LogoutPhase> = _phase.asStateFlow()

    private val _effects = Channel<SignOutEffect>(Channel.BUFFERED)
    val effects: Flow<SignOutEffect> = _effects.receiveAsFlow()

    fun onEvent(event: SignOutEvent) {
        when (event) {
            SignOutEvent.Requested -> _phase.update { it.requested() }
            SignOutEvent.Cancelled -> _phase.update { it.cancelled() }
            SignOutEvent.Confirmed -> confirm()
        }
    }

    private fun confirm() {
        if (_phase.value != LogoutPhase.Confirming) return
        _phase.value = LogoutPhase.InProgress
        viewModelScope.launch {
            // La purge vide le jeton, ce qui fait basculer la racine sur la connexion et détruit cet écran :
            // elle ne doit pas être coupée en route par l'annulation de viewModelScope.
            withContext(NonCancellable) {
                try {
                    authRepository.logout()
                    realtimeCoordinator.onAuthenticatedChanged(false)
                } finally {
                    _phase.update { it.finished() }
                    _effects.trySend(SignOutEffect.SignedOut)
                }
            }
        }
    }
}
