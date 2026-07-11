package me.meeshy.sdk.media

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
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.mediaDownloadPreferencesFromStorage
import me.meeshy.sdk.model.storageValue

/**
 * The durable media-auto-download preference seam (feature-parity §L). Holds the persisted
 * [MediaDownloadPreferences] block and exposes it as an observable [StateFlow] so the settings
 * UI reflects a policy change the instant it happens, and hydrates it on cold start so the
 * persisted choice paints without a flash of the wrong (default) configuration.
 *
 * A stateless building block: it owns only the stored token; the storage codec and the
 * safe-defaults corruption fallback live in the pure [MediaDownloadPreferences] helpers.
 */
public interface MediaDownloadPreferencesStore {
    /** The current media-download preferences, defaulting to [MediaDownloadPreferences]. */
    public val preferences: StateFlow<MediaDownloadPreferences>

    /** Persists the whole media-download preference block. */
    public suspend fun setPreferences(preferences: MediaDownloadPreferences)
}

/** Volatile [MediaDownloadPreferencesStore] — for tests and previews. */
public class InMemoryMediaDownloadPreferencesStore(
    initial: MediaDownloadPreferences = MediaDownloadPreferences(),
) : MediaDownloadPreferencesStore {
    private val _preferences = MutableStateFlow(initial)
    override val preferences: StateFlow<MediaDownloadPreferences> = _preferences.asStateFlow()

    override suspend fun setPreferences(preferences: MediaDownloadPreferences) {
        _preferences.value = preferences
    }
}

/**
 * [MediaDownloadPreferencesStore] backed by a Preferences [DataStore] (the SOTA replacement for
 * `SharedPreferences`). The persisted token is decoded through the pure
 * [mediaDownloadPreferencesFromStorage] codec, so a corrupt/legacy value degrades to the safe
 * defaults instead of crashing.
 */
public class DataStoreMediaDownloadPreferencesStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : MediaDownloadPreferencesStore {

    override val preferences: StateFlow<MediaDownloadPreferences> =
        dataStore.data
            .map { prefs -> mediaDownloadPreferencesFromStorage(prefs[KEY]) }
            .stateIn(scope, SharingStarted.Eagerly, MediaDownloadPreferences())

    override suspend fun setPreferences(preferences: MediaDownloadPreferences) {
        dataStore.edit { prefs -> prefs[KEY] = preferences.storageValue }
    }

    private companion object {
        private val KEY = stringPreferencesKey("media_download_preferences")
    }
}
