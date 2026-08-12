package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.MediaDownloadPreferencesStore
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.MediaKind
import javax.inject.Inject

/** Immutable UI state for the media-auto-download settings screen (feature-parity §L). */
data class MediaDownloadUiState(
    val preferences: MediaDownloadPreferences = MediaDownloadPreferences(),
)

/**
 * Drives the media-auto-download settings screen. The durable [MediaDownloadPreferencesStore]
 * is the single source of truth: this ViewModel mirrors its persisted block into an immutable
 * [MediaDownloadUiState] (so a policy change repaints instantly and the persisted choice paints
 * on cold start without a flash), and writes a per-kind change back through the store —
 * `withPolicy` sets exactly the chosen kind, never clobbering the others. A re-selection of the
 * kind's current policy is an inert no-op.
 */
@HiltViewModel
class MediaDownloadViewModel @Inject constructor(
    private val store: MediaDownloadPreferencesStore,
) : ViewModel() {

    val state: StateFlow<MediaDownloadUiState> =
        store.preferences
            .map { MediaDownloadUiState(preferences = it) }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.Eagerly,
                initialValue = MediaDownloadUiState(store.preferences.value),
            )

    fun setPolicy(kind: MediaKind, policy: AutoDownloadPolicy) {
        // Read the base *inside* the launch so back-to-back edits on different kinds
        // serialize through viewModelScope and never clobber each other's write.
        viewModelScope.launch {
            val current = store.preferences.value
            if (current.policy(kind) == policy) return@launch
            store.setPreferences(current.withPolicy(kind, policy))
        }
    }
}
