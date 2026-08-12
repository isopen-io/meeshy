package me.meeshy.sdk.language

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
import me.meeshy.sdk.model.AppLanguage

/**
 * The durable interface-language (app UI chrome) preference seam (feature-parity §L).
 * Holds the persisted choice — a supported language code, or `null` to follow the device
 * locale ("System") — and exposes it as an observable [StateFlow] so the app can re-localise
 * the whole UI the instant the user changes it, and hydrate it on cold start so the persisted
 * choice paints without a flash of the wrong language.
 *
 * A stateless building block: it owns only the stored token; the supported-set, storage codec,
 * and locale resolution live in the pure [AppLanguage] helpers.
 */
public interface InterfaceLanguageStore {
    /** The current interface-language preference: a supported code, or `null` = follow device. */
    public val languageCode: StateFlow<String?>

    /** Persists the interface-language preference (unsupported/`null` → "System"). */
    public suspend fun setLanguageCode(code: String?)
}

/** Volatile [InterfaceLanguageStore] — for tests and previews. Normalises through the codec. */
public class InMemoryInterfaceLanguageStore(
    initial: String? = null,
) : InterfaceLanguageStore {
    private val _languageCode = MutableStateFlow(AppLanguage.resolveInterfaceLocaleTag(initial))
    override val languageCode: StateFlow<String?> = _languageCode.asStateFlow()

    override suspend fun setLanguageCode(code: String?) {
        _languageCode.value = AppLanguage.resolveInterfaceLocaleTag(code)
    }
}

/**
 * [InterfaceLanguageStore] backed by a Preferences [DataStore] (the SOTA replacement for
 * `SharedPreferences`). The persisted token is decoded through the pure [AppLanguage.fromStorage]
 * codec, so a corrupt/legacy value degrades to "System" (`null`) instead of crashing.
 */
public class DataStoreInterfaceLanguageStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : InterfaceLanguageStore {

    override val languageCode: StateFlow<String?> =
        dataStore.data
            .map { prefs -> AppLanguage.fromStorage(prefs[KEY]) }
            .stateIn(scope, SharingStarted.Eagerly, null)

    override suspend fun setLanguageCode(code: String?) {
        dataStore.edit { prefs -> prefs[KEY] = AppLanguage.storageValue(code) }
    }

    private companion object {
        private val KEY = stringPreferencesKey("interface_language")
    }
}
