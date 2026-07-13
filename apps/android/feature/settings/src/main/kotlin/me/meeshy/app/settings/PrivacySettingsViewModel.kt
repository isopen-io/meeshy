package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.PrivacyCatalog
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.PrivacyToggle
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import javax.inject.Inject

/** Immutable UI state for the privacy & visibility settings screen (feature-parity §L). */
data class PrivacyUiState(
    val preferences: PrivacyPreferences = PrivacyPreferences(),
)

/**
 * Drives the privacy & visibility settings screen. The durable [PrivacyPreferencesStore] is the
 * single source of truth: this ViewModel mirrors its persisted block into an immutable
 * [PrivacyUiState] (so a toggle change repaints instantly and the persisted choice paints on cold
 * start without a flash), and writes a per-toggle change back through the store —
 * [PrivacyCatalog.set] edits exactly the chosen boolean, never clobbering the others. A re-set of
 * a toggle to its current value is an inert no-op.
 */
@HiltViewModel
class PrivacySettingsViewModel @Inject constructor(
    private val store: PrivacyPreferencesStore,
) : ViewModel() {

    val state: StateFlow<PrivacyUiState> =
        store.preferences
            .map { PrivacyUiState(preferences = it) }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.Eagerly,
                initialValue = PrivacyUiState(store.preferences.value),
            )

    fun setToggle(toggle: PrivacyToggle, enabled: Boolean) {
        // Read the base *inside* the launch so back-to-back edits on different toggles
        // serialize through viewModelScope and never clobber each other's write.
        viewModelScope.launch {
            val current = store.preferences.value
            if (PrivacyCatalog.isEnabled(current, toggle) == enabled) return@launch
            store.setPreferences(PrivacyCatalog.set(current, toggle, enabled))
        }
    }
}
