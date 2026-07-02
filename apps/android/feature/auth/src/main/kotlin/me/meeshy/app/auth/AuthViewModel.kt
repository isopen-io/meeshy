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
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import javax.inject.Inject

data class AuthUiState(
    val username: String = "",
    val password: String = "",
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    @get:StringRes val errorRes: Int? = null,
    val isAuthenticated: Boolean = false,
) {
    val canSubmit: Boolean get() = username.isNotBlank() && password.isNotBlank() && !isSubmitting
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val realtimeCoordinator: RealtimeSessionCoordinator,
) : ViewModel() {

    private val _state = MutableStateFlow(AuthUiState(isAuthenticated = authRepository.isAuthenticated))
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    init {
        realtimeCoordinator.onAuthenticatedChanged(authRepository.isAuthenticated)
        if (authRepository.isAuthenticated) {
            viewModelScope.launch { authRepository.restoreSession() }
        }
    }

    fun onUsernameChange(value: String) {
        _state.update { it.copy(username = value, errorMessage = null, errorRes = null) }
    }

    fun onPasswordChange(value: String) {
        _state.update { it.copy(password = value, errorMessage = null, errorRes = null) }
    }

    fun login() {
        val current = _state.value
        if (current.username.isBlank() || current.password.isBlank()) {
            _state.update { it.copy(errorRes = R.string.login_error_required) }
            return
        }
        _state.update { it.copy(isSubmitting = true, errorMessage = null, errorRes = null) }
        viewModelScope.launch {
            val result = authRepository.login(current.username.trim(), current.password)
            if (result is NetworkResult.Success) {
                realtimeCoordinator.onAuthenticatedChanged(true)
            }
            _state.update {
                when (result) {
                    is NetworkResult.Success -> it.copy(isSubmitting = false, isAuthenticated = true)
                    is NetworkResult.Failure -> it.copy(isSubmitting = false, errorMessage = result.error.message)
                }
            }
        }
    }

    fun logout() {
        authRepository.logout()
        realtimeCoordinator.onAuthenticatedChanged(false)
        _state.value = AuthUiState()
    }
}
