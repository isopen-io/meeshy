package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.language.InterfaceLanguageStore
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.next
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.preferences.ApplicationPreferencesSyncRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.ThemeStore
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

data class SettingsUiState(
    val userId: String? = null,
    val username: String? = null,
    val displayName: String? = null,
    val email: String? = null,
    val avatar: String? = null,
    val themeMode: AppThemeMode = AppThemeMode.AUTO,
    val interfaceLanguage: String? = null,
    val systemLanguage: String? = null,
    val regionalLanguage: String? = null,
    val regionalLanguageQuery: String = "",
    val isLoading: Boolean = false,
) {
    /** iOS `SettingsView.profileCard` : le nom affiché en titre, le pseudo à défaut. */
    val profileTitle: String get() = displayName?.trim()?.takeIf { it.isNotEmpty() } ?: username.orEmpty()

    /** iOS `SettingsView.profileCard` : « @pseudo » sous le titre. */
    val profileHandle: String? get() = username?.takeIf { it.isNotBlank() }?.let { "@$it" }
}

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val userRepository: UserRepository,
    private val themeStore: ThemeStore,
    private val interfaceLanguageStore: InterfaceLanguageStore,
    private val workManager: WorkManager,
    private val applicationSync: ApplicationPreferencesSyncRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(SettingsUiState())
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            sessionRepository.currentUser.collect { user ->
                _state.update {
                    it.copy(
                        userId = user?.id,
                        username = user?.username,
                        displayName = user?.displayName,
                        email = user?.email,
                        avatar = user?.avatar,
                        systemLanguage = user?.systemLanguage,
                        regionalLanguage = user?.regionalLanguage,
                    )
                }
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
        viewModelScope.launch { applyTheme(mode) }
    }

    /** Advances the appearance to the next mode — the tap-to-cycle gesture. */
    fun cycleTheme() {
        viewModelScope.launch { applyTheme(themeStore.themeMode.value.next()) }
    }

    /** Peint le thème à l'instant depuis le magasin local, puis le met en file vers le compte (un seul PATCH par rafale). */
    private suspend fun applyTheme(mode: AppThemeMode) {
        themeStore.setThemeMode(mode)
        val cmid = applicationSync.enqueueTheme(mode)
        if (cmid != null) workManager.enqueue(OutboxFlushWorker.buildRequest())
    }

    /** Persists the interface (UI chrome) language; `null` follows the device locale. */
    fun setInterfaceLanguage(code: String?) {
        viewModelScope.launch { interfaceLanguageStore.setLanguageCode(code) }
    }

    /**
     * Sets the regional (secondary content) language — a Prisme *content* preference on the
     * backend profile, NOT the app UI locale. It flows through the optimistic + offline-queued
     * profile-edit path: [UserRepository.enqueueProfileEdit] repaints the session identity
     * instantly (so this row and every content surface reflect the choice at once) and queues
     * a durable `UPDATE_PROFILE` mutation, waking the flush worker only when a real row was
     * enqueued (a sessionless/superseded enqueue returns `null` — nothing to flush).
     */
    fun setRegionalLanguage(code: String) {
        viewModelScope.launch {
            val cmid = userRepository.enqueueProfileEdit(UpdateProfileRequest(regionalLanguage = code))
            if (cmid != null) workManager.enqueue(OutboxFlushWorker.buildRequest())
        }
    }

    /** Updates the UI-only search query that filters the regional-language picker. */
    fun setRegionalLanguageQuery(query: String) {
        _state.update { it.copy(regionalLanguageQuery = query) }
    }
}
