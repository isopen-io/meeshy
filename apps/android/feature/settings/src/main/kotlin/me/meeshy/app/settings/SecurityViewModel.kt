package me.meeshy.app.settings

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

/** Statut de l'authentification à deux facteurs affiché par la section 2FA. */
@Immutable
sealed interface TwoFactorStatusUi {
    /** Premier chargement, aucun statut connu : ligne squelette. */
    data object Loading : TwoFactorStatusUi

    /** Échec sans statut connu : ligne d'erreur avec Réessayer. */
    data object Failed : TwoFactorStatusUi

    /** Dernier statut connu (conservé tel quel quand un rechargement échoue : hors ligne). */
    data class Known(val enabled: Boolean, val backupCodesCount: Int) : TwoFactorStatusUi
}

@Immutable
data class SecurityUiState(val twoFactor: TwoFactorStatusUi = TwoFactorStatusUi.Loading)

sealed interface SecurityUiEvent {
    /** L'écran revient au premier plan (aussi après TwoFactorScreen) : relire le statut. */
    data object Resumed : SecurityUiEvent
    data object RetryTwoFactor : SecurityUiEvent
}

/**
 * Pilote la page Sécurité (SecurityView iOS). Les sections e-mail et téléphone gardent
 * leur [AccountContactViewModel] ; ici, seul le statut 2FA, chargé à l'init, relu à
 * chaque retour au premier plan, jamais écrasé par une panne réseau.
 */
@HiltViewModel
class SecurityViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(SecurityUiState())
    val state: StateFlow<SecurityUiState> = _state.asStateFlow()

    private var loadJob: Job? = null

    init {
        loadTwoFactorStatus()
    }

    fun onEvent(event: SecurityUiEvent) {
        when (event) {
            SecurityUiEvent.Resumed -> loadTwoFactorStatus()
            SecurityUiEvent.RetryTwoFactor -> {
                if (_state.value.twoFactor is TwoFactorStatusUi.Failed) {
                    _state.update { it.copy(twoFactor = TwoFactorStatusUi.Loading) }
                }
                loadTwoFactorStatus()
            }
        }
    }

    private fun loadTwoFactorStatus() {
        if (loadJob?.isActive == true) return
        loadJob = viewModelScope.launch {
            when (val result = authRepository.getTwoFactorStatus()) {
                is NetworkResult.Success -> _state.update {
                    it.copy(
                        twoFactor = TwoFactorStatusUi.Known(
                            enabled = result.data.enabled,
                            backupCodesCount = result.data.backupCodesCount,
                        ),
                    )
                }
                is NetworkResult.Failure -> _state.update {
                    if (it.twoFactor is TwoFactorStatusUi.Known) it else it.copy(twoFactor = TwoFactorStatusUi.Failed)
                }
            }
        }
    }
}
