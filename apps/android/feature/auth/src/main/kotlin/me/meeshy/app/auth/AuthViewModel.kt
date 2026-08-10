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
import me.meeshy.sdk.auth.SavedAccountsStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.sdk.model.auth.SavedAccounts
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
    val savedAccounts: List<SavedAccount> = emptyList(),
    val selectedAccount: SavedAccount? = null,
    val showNormalLogin: Boolean = false,
) {
    val canSubmit: Boolean get() = username.isNotBlank() && password.isNotBlank() && !isSubmitting

    /** iOS `LoginView.showPicker` — the remembered-account list instead of the credential form. */
    val showPicker: Boolean get() = SavedAccounts.showPicker(savedAccounts, showNormalLogin)
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val realtimeCoordinator: RealtimeSessionCoordinator,
    private val savedAccountsStore: SavedAccountsStore,
    private val cacheClock: CacheClock,
) : ViewModel() {

    private val _state = MutableStateFlow(
        AuthUiState(
            isAuthenticated = authRepository.isAuthenticated,
            savedAccounts = savedAccountsStore.accounts.value,
        ),
    )
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    init {
        realtimeCoordinator.onAuthenticatedChanged(authRepository.isAuthenticated)
        if (authRepository.isAuthenticated) {
            viewModelScope.launch { authRepository.restoreSession() }
        }
        viewModelScope.launch {
            savedAccountsStore.accounts.collect { accounts ->
                _state.update { it.copy(savedAccounts = accounts) }
            }
        }
    }

    fun onUsernameChange(value: String) {
        _state.update { it.copy(username = value, errorMessage = null, errorRes = null) }
    }

    fun onPasswordChange(value: String) {
        _state.update { it.copy(password = value, errorMessage = null, errorRes = null) }
    }

    /** A saved-account row was tapped — prefill its username, focus jumps to password. */
    fun selectAccount(account: SavedAccount) {
        _state.update {
            it.copy(
                selectedAccount = account,
                username = account.username,
                password = "",
                errorMessage = null,
                errorRes = null,
            )
        }
    }

    /** Back arrow on the selected-account view — returns to the picker list. */
    fun deselectAccount() {
        _state.update {
            it.copy(selectedAccount = null, password = "", errorMessage = null, errorRes = null)
        }
    }

    /** "Other account" — switches the picker to the normal username/password form. */
    fun useAnotherAccount() {
        _state.update { it.copy(showNormalLogin = true, selectedAccount = null) }
    }

    /** Back-to-picker link on the normal form — only reachable when accounts exist. */
    fun backToSavedAccounts() {
        _state.update { it.copy(showNormalLogin = false) }
    }

    /** Long-press/trailing "remove" affordance on a picker row. */
    fun removeAccount(userId: String) {
        savedAccountsStore.remove(userId)
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
                val user = result.data.user
                savedAccountsStore.upsert(
                    SavedAccount(
                        id = user.id,
                        username = user.username,
                        displayName = user.displayName,
                        avatarUrl = user.avatar,
                        lastActiveAtMillis = cacheClock.nowMillis(),
                    ),
                )
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
        viewModelScope.launch {
            authRepository.logout()
            realtimeCoordinator.onAuthenticatedChanged(false)
            _state.value = AuthUiState(savedAccounts = savedAccountsStore.accounts.value)
        }
    }
}
