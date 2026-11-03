package me.meeshy.app.auth

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.LoginHandoffs
import me.meeshy.sdk.auth.WelcomeStore

@Immutable
data class WelcomeUiState(
    /** Vrai tant que la lecture durable n'a pas répondu : l'accueil ne paraît jamais sur une réponse inconnue. */
    val hasSeenWelcome: Boolean = true,
    val isSigningUp: Boolean = false,
)

sealed interface WelcomeUiEvent {
    data object CreateAccountTapped : WelcomeUiEvent
    data object SignInTapped : WelcomeUiEvent

    /** L'inscription se ferme sans compte : l'accueil reste, rien n'est soldé. */
    data object SignupClosed : WelcomeUiEvent

    /** Le compte existe : l'accueil est soldé, la racine prend la suite. */
    data object AccountCreated : WelcomeUiEvent

    /** Bascule vers la connexion depuis l'inscription, avec l'e-mail déjà tapé. */
    data class SwitchToLogin(val email: String?) : WelcomeUiEvent
}

/** Qui solde l'accueil : « Se connecter », un compte créé et la bascule vers la connexion ; fermer l'inscription sans compte, non. */
@HiltViewModel
class WelcomeViewModel @Inject constructor(
    private val store: WelcomeStore,
    private val handoffs: LoginHandoffs,
) : ViewModel() {

    private val signingUp = MutableStateFlow(false)

    val state: StateFlow<WelcomeUiState> = combine(store.isSettled, signingUp) { settled, signing ->
        WelcomeUiState(hasSeenWelcome = settled ?: true, isSigningUp = signing)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), WelcomeUiState())

    fun onEvent(event: WelcomeUiEvent) {
        when (event) {
            WelcomeUiEvent.CreateAccountTapped -> signingUp.value = true
            WelcomeUiEvent.SignupClosed -> signingUp.value = false
            WelcomeUiEvent.SignInTapped -> settle()
            WelcomeUiEvent.AccountCreated -> settle()
            is WelcomeUiEvent.SwitchToLogin -> {
                handoffs.signupEmail.hold(event.email?.trim()?.takeIf { it.isNotEmpty() })
                settle()
            }
        }
    }

    private fun settle() {
        signingUp.update { false }
        viewModelScope.launch { store.settle() }
    }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
