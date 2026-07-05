package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.language.InterfaceLanguageStore
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.sdk.model.next
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.ThemeStore
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

data class SettingsUiState(
    val userId: String? = null,
    val username: String? = null,
    val email: String? = null,
    val avatar: String? = null,
    val themeMode: AppThemeMode = AppThemeMode.AUTO,
    val interfaceLanguage: String? = null,
    val isLoading: Boolean = false,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val userRepository: UserRepository,
    private val themeStore: ThemeStore,
    private val interfaceLanguageStore: InterfaceLanguageStore,
) : ViewModel() {

    private val _state = MutableStateFlow(SettingsUiState())
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            sessionRepository.currentUser.collect { user ->
                _state.update { it.copy(userId = user?.id, username = user?.username, email = user?.email, avatar = user?.avatar) }
            }
        }
        viewModelScope.launch {
            themeStore.themeMode.collect { mode ->
                _state.update { it.copy(themeMode = mode) }
            }
        }
        viewModelScope.launch {
            interfaceLanguageStore.languageCode.collect { code ->
                _state.update { it.copy(interfaceLanguage = code) }
            }
        }
    }

    /** Persists an explicit appearance choice (light/dark/system). */
    fun setThemeMode(mode: AppThemeMode) {
        viewModelScope.launch { themeStore.setThemeMode(mode) }
    }

    /** Advances the appearance to the next mode — the tap-to-cycle gesture. */
    fun cycleTheme() {
        viewModelScope.launch { themeStore.setThemeMode(themeStore.themeMode.value.next()) }
    }

    /** Persists the interface (UI chrome) language; `null` follows the device locale. */
    fun setInterfaceLanguage(code: String?) {
        viewModelScope.launch { interfaceLanguageStore.setLanguageCode(code) }
    }
}
