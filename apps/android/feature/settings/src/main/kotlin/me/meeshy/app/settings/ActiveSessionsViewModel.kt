package me.meeshy.app.settings

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
import me.meeshy.sdk.net.api.ActiveSessionInfo
import javax.inject.Inject

data class ActiveSessionsUiState(
    val sessions: List<ActiveSessionInfo> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val revokingIds: Set<String> = emptySet(),
)

/** Sessions actives : liste, revocation unitaire optimiste, revocation des autres. */
@HiltViewModel
class ActiveSessionsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ActiveSessionsUiState())
    val state: StateFlow<ActiveSessionsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = authRepository.listSessions()) {
                is NetworkResult.Success -> _state.update {
                    it.copy(isLoading = false, sessions = result.data.sessions)
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(isLoading = false, errorMessage = result.error.message)
                }
            }
        }
    }

    fun revoke(sessionId: String) {
        _state.update { it.copy(revokingIds = it.revokingIds + sessionId) }
        viewModelScope.launch {
            when (authRepository.revokeSession(sessionId)) {
                is NetworkResult.Success -> _state.update {
                    it.copy(
                        revokingIds = it.revokingIds - sessionId,
                        sessions = it.sessions.filterNot { s -> s.id == sessionId },
                    )
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(revokingIds = it.revokingIds - sessionId)
                }
            }
        }
    }

    fun revokeOthers() {
        viewModelScope.launch {
            if (authRepository.revokeOtherSessions() is NetworkResult.Success) {
                _state.update { it.copy(sessions = it.sessions.filter { s -> s.isCurrentSession }) }
            }
        }
    }
}
