package me.meeshy.app.navigation

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
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.rootnav.RootCoverage
import me.meeshy.sdk.model.rootnav.RootPresentationRules
import me.meeshy.sdk.model.rootnav.RootRoute
import me.meeshy.sdk.session.SessionRepository

/** Ce que la racine sait de la session, projeté depuis l'authentification, la restauration et le lien en attente. */
@Immutable
data class RootSessionUiState(
    val route: RootRoute = RootRoute.NONE,
    val showsPendingLinkNotice: Boolean = false,
)

sealed interface RootSessionEvent {
    data class AuthChanged(
        val isAuthenticated: Boolean,
        val isRestoringSession: Boolean,
    ) : RootSessionEvent

    data class PendingLinkChanged(val opensAfterSignIn: Boolean) : RootSessionEvent
}

/**
 * Le présentateur de la racine (iOS `AppRootSession` + `SessionContent`) : combine l'état d'authentification que
 * l'écran lui remet, [SessionRepository.hasResolvedStoredSession] et le lien en attente, puis laisse la loi pure
 * [RootPresentationRules] décider. L'écran de connexion ne paraît jamais tant que la session stockée n'est pas vérifiée.
 */
@HiltViewModel
class RootSessionViewModel @Inject constructor(
    sessionRepository: SessionRepository,
    authRepository: AuthRepository,
) : ViewModel() {

    private data class Inputs(
        val isAuthenticated: Boolean = false,
        val isRestoring: Boolean = true,
        val pendingLink: Boolean = false,
    )

    private val seed = Inputs(
        isAuthenticated = authRepository.isAuthenticated,
        isRestoring = !authRepository.isAuthenticated,
    )

    private val inputs = MutableStateFlow(seed)

    private fun present(i: Inputs, resolved: Boolean): RootSessionUiState {
        val route = RootPresentationRules.route(
            isAuthenticated = i.isAuthenticated,
            isSwitchingAccount = false,
            hasCheckedSession = RootCoverage.hasCheckedSession(resolved, i.isRestoring),
            previewReplacesLogin = false,
        )
        return RootSessionUiState(route, RootCoverage.showsPendingLinkNotice(route, i.pendingLink))
    }

    val state: StateFlow<RootSessionUiState> = combine(inputs, sessionRepository.hasResolvedStoredSession) { i, resolved -> present(i, resolved) }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
            present(seed, sessionRepository.hasResolvedStoredSession.value),
        )

    fun onEvent(event: RootSessionEvent) {
        when (event) {
            is RootSessionEvent.AuthChanged -> inputs.update {
                it.copy(
                    isAuthenticated = event.isAuthenticated,
                    isRestoring = event.isRestoringSession,
                )
            }
            is RootSessionEvent.PendingLinkChanged -> inputs.update { it.copy(pendingLink = event.opensAfterSignIn) }
        }
    }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
