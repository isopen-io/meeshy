package me.meeshy.sdk.privacy

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.privacyPreferencesFromStorage
import me.meeshy.sdk.model.storageValue

/**
 * The durable privacy-preference seam (feature-parity §L). Holds the persisted
 * [PrivacyPreferences] block and exposes it as an observable [StateFlow] so the settings UI
 * reflects a toggle change the instant it happens, and hydrates it on cold start so the persisted
 * choice paints without a flash of the wrong (default) configuration.
 *
 * A stateless building block: it owns only the stored token; the storage codec and the
 * safe-defaults corruption fallback live in the pure [PrivacyPreferences] helpers.
 */
public interface PrivacyPreferencesStore {
    /** The current privacy preferences, defaulting to [PrivacyPreferences]. */
    public val preferences: StateFlow<PrivacyPreferences>

    /** Persists the whole privacy preference block. */
    public suspend fun setPreferences(preferences: PrivacyPreferences)
}

/** Volatile [PrivacyPreferencesStore] — for tests and previews. */
public class InMemoryPrivacyPreferencesStore(
    initial: PrivacyPreferences = PrivacyPreferences(),
) : PrivacyPreferencesStore {
    private val _preferences = MutableStateFlow(initial)
    override val preferences: StateFlow<PrivacyPreferences> = _preferences.asStateFlow()

    override suspend fun setPreferences(preferences: PrivacyPreferences) {
        _preferences.value = preferences
    }
}

/**
 * [PrivacyPreferencesStore] backed by a Preferences [DataStore] (the SOTA replacement for
 * `SharedPreferences`). The persisted token is decoded through the pure
 * [privacyPreferencesFromStorage] codec, so a corrupt/legacy value degrades to the safe defaults
 * instead of crashing.
 */
public class DataStorePrivacyPreferencesStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : PrivacyPreferencesStore {

    override val preferences: StateFlow<PrivacyPreferences> =
        dataStore.data
            .map { prefs -> privacyPreferencesFromStorage(prefs[KEY]) }
            .stateIn(scope, SharingStarted.Eagerly, PrivacyPreferences())

    override suspend fun setPreferences(preferences: PrivacyPreferences) {
        dataStore.edit { prefs -> prefs[KEY] = preferences.storageValue }
    }

    private companion object {
        private val KEY = stringPreferencesKey("privacy_preferences")
    }
}
