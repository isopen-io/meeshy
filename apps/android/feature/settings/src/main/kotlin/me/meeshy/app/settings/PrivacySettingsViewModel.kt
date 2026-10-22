package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.location.LocationSharingPreferencesStore
import me.meeshy.sdk.model.LocationPrecision
import me.meeshy.sdk.model.LocationSharingPreferences
import me.meeshy.sdk.model.SharedMapStyle
import me.meeshy.sdk.model.PrivacyCatalog
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.PrivacyToggle
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.privacy.PrivacyPreferencesSyncRepository
import javax.inject.Inject

/** Immutable UI state for the privacy & visibility settings screen (feature-parity §L). */
data class PrivacyUiState(
    val preferences: PrivacyPreferences = PrivacyPreferences(),
    val locationSharing: LocationSharingPreferences = LocationSharingPreferences(),
)

/**
 * Drives the privacy & visibility settings screen. The durable [PrivacyPreferencesStore] is the
 * single source of truth: this ViewModel mirrors its persisted block into an immutable
 * [PrivacyUiState] (so a toggle change repaints instantly and the persisted choice paints on cold
 * start without a flash), and writes a per-toggle change back through the store —
 * [PrivacyCatalog.set] edits exactly the chosen boolean, never clobbering the others. A re-set of
 * a toggle to its current value is an inert no-op.
 *
 * A real change is also propagated to the gateway through [PrivacyPreferencesSyncRepository] (a
 * durable, offline-queued `PATCH /me/preferences/privacy`); the [OutboxFlushWorker] is woken only
 * when the enqueue produced a real `cmid` (a session-less enqueue is inert and returns `null`).
 * The device-local store stays the UI SSOT, so the sync never gates the instant repaint.
 */
@HiltViewModel
class PrivacySettingsViewModel @Inject constructor(
    private val store: PrivacyPreferencesStore,
    private val syncRepository: PrivacyPreferencesSyncRepository,
    private val workManager: WorkManager,
    private val locationStore: LocationSharingPreferencesStore,
) : ViewModel() {

    val state: StateFlow<PrivacyUiState> =
        combine(store.preferences, locationStore.preferences) { privacy, location ->
            PrivacyUiState(preferences = privacy, locationSharing = location)
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.Eagerly,
            initialValue = PrivacyUiState(
                preferences = store.preferences.value,
                locationSharing = locationStore.preferences.value,
            ),
        )

    /** Persists the chosen location-sharing grain; it rounds coordinates before any send. */
    fun setLocationPrecision(precision: LocationPrecision) {
        viewModelScope.launch { locationStore.setPrecision(precision) }
    }

    fun setLocationMapStyle(style: SharedMapStyle) {
        viewModelScope.launch { locationStore.setMapStyle(style) }
    }

    fun setToggle(toggle: PrivacyToggle, enabled: Boolean) {
        // Read the base *inside* the launch so back-to-back edits on different toggles
        // serialize through viewModelScope and never clobber each other's write.
        viewModelScope.launch {
            val current = store.preferences.value
            if (PrivacyCatalog.isEnabled(current, toggle) == enabled) return@launch
            val updated = PrivacyCatalog.set(current, toggle, enabled)
            store.setPreferences(updated)
            val cmid = syncRepository.enqueueSync(updated)
            if (cmid != null) workManager.enqueue(OutboxFlushWorker.buildRequest())
        }
    }
}
