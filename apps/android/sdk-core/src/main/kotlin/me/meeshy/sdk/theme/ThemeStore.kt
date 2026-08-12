package me.meeshy.sdk.theme

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
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.sdk.model.appThemeModeFromStorage
import me.meeshy.sdk.model.storageValue

/**
 * The durable appearance-preference seam (feature-parity §L). Holds the persisted
 * light/dark/system choice and exposes it as an observable [StateFlow] so the whole
 * app re-themes the instant the user changes it, and hydrates it on cold start so
 * the persisted choice paints without a flash of the wrong theme.
 *
 * A stateless building block: it owns only the stored token; the light/dark
 * resolution and the storage codec live in the pure `AppThemeMode` helpers.
 */
public interface ThemeStore {
    /** The current appearance preference, defaulting to [AppThemeMode.AUTO]. */
    public val themeMode: StateFlow<AppThemeMode>

    /** Persists the appearance preference. */
    public suspend fun setThemeMode(mode: AppThemeMode)
}

/** Volatile [ThemeStore] — for tests and previews. */
public class InMemoryThemeStore(
    initial: AppThemeMode = AppThemeMode.AUTO,
) : ThemeStore {
    private val _themeMode = MutableStateFlow(initial)
    override val themeMode: StateFlow<AppThemeMode> = _themeMode.asStateFlow()

    override suspend fun setThemeMode(mode: AppThemeMode) {
        _themeMode.value = mode
    }
}

/**
 * [ThemeStore] backed by a Preferences [DataStore] (the SOTA replacement for
 * `SharedPreferences`). The persisted token is decoded through the pure
 * [appThemeModeFromStorage] codec, so a corrupt/legacy value degrades to
 * [AppThemeMode.AUTO] instead of crashing.
 */
public class DataStoreThemeStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : ThemeStore {

    override val themeMode: StateFlow<AppThemeMode> =
        dataStore.data
            .map { prefs -> appThemeModeFromStorage(prefs[KEY]) }
            .stateIn(scope, SharingStarted.Eagerly, AppThemeMode.AUTO)

    override suspend fun setThemeMode(mode: AppThemeMode) {
        dataStore.edit { prefs -> prefs[KEY] = mode.storageValue }
    }

    private companion object {
        private val KEY = stringPreferencesKey("theme_mode")
    }
}
