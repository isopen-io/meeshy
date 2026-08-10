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
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

data class MagicLinkValidateUiState(
    val isValidating: Boolean = true,
    val isAuthenticated: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * Valide le token du magic link des l'arrivee sur l'ecran.
 *
 * P0 (parite iOS `validateMagicLinkToken`) : un lien tape alors qu'un compte est
 * DEJA ouvert — possiblement un AUTRE compte — passe par un logout complet
 * (teardown caches/sockets/cles) AVANT la validation. `storeSession(B)` par
 * dessus la session A ferait fuiter les caches et le JWT de A dans la session B.
 */
@HiltViewModel
class MagicLinkValidateViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val token: String = savedStateHandle.get<String>(TOKEN_ARG).orEmpty()

    private val _state = MutableStateFlow(MagicLinkValidateUiState())
    val state: StateFlow<MagicLinkValidateUiState> = _state.asStateFlow()

    init {
        validate()
    }

    private fun validate() {
        if (token.isBlank()) {
            _state.update { it.copy(isValidating = false, errorMessage = null) }
            return
        }
        viewModelScope.launch {
            if (authRepository.isAuthenticated) {
                authRepository.logout()
            }
            when (val result = authRepository.loginWithMagicLink(token)) {
                is NetworkResult.Success -> _state.update {
                    it.copy(isValidating = false, isAuthenticated = true)
                }
                is NetworkResult.Failure -> _state.update {
                    // Le gateway renvoie parfois un message vide (token expire) :
                    // ne garder que le non-blanc, l'ecran a un libelle par defaut.
                    it.copy(isValidating = false, errorMessage = result.error.message.takeIf { m -> m.isNotBlank() })
                }
            }
        }
    }

    companion object {
        const val TOKEN_ARG: String = "token"
    }
}
