package me.meeshy.sdk.preferences

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.accessibility.AccessibilitySettings

/**
 * Reglages d'accessibilite de l'app (iOS `MeeshyAccessibilityPreferences`) : un flux observable, mis a jour
 * immediatement, et persiste avec une sauvegarde differee de [SAVE_DEBOUNCE_MILLIS].
 */
public interface AccessibilityPreferencesStore {
    public val settings: StateFlow<AccessibilitySettings>

    public fun update(transform: (AccessibilitySettings) -> AccessibilitySettings)

    public companion object {
        public const val SAVE_DEBOUNCE_MILLIS: Long = 100
    }
}

/** Version volatile, pour les tests et les apercus. */
public class InMemoryAccessibilityPreferencesStore(
    initial: AccessibilitySettings = AccessibilitySettings.DEFAULTS,
) : AccessibilityPreferencesStore {
    private val state = MutableStateFlow(initial)
    override val settings: StateFlow<AccessibilitySettings> = state.asStateFlow()

    override fun update(transform: (AccessibilitySettings) -> AccessibilitySettings) {
        state.value = transform(state.value)
    }
}

/**
 * Version durable (Preferences DataStore). Une valeur illisible retombe sur les defauts ; chaque changement
 * est visible tout de suite, l'ecriture disque etant regroupee par [AccessibilityPreferencesStore.SAVE_DEBOUNCE_MILLIS].
 */
public class DataStoreAccessibilityPreferencesStore(
    private val dataStore: DataStore<Preferences>,
    private val scope: CoroutineScope,
    private val debounceMillis: Long = AccessibilityPreferencesStore.SAVE_DEBOUNCE_MILLIS,
) : AccessibilityPreferencesStore {

    private val state = MutableStateFlow(AccessibilitySettings.DEFAULTS)
    override val settings: StateFlow<AccessibilitySettings> = state.asStateFlow()

    private var edited = false
    private var pendingSave: Job? = null

    init {
        scope.launch {
            val stored = decode(dataStore.data.first()[KEY])
            if (!edited) state.value = stored
        }
    }

    override fun update(transform: (AccessibilitySettings) -> AccessibilitySettings) {
        edited = true
        val next = transform(state.value)
        state.value = next
        pendingSave?.cancel()
        pendingSave = scope.launch {
            delay(debounceMillis)
            dataStore.edit { it[KEY] = JSON.encodeToString(AccessibilitySettings.serializer(), next) }
        }
    }

    private fun decode(raw: String?): AccessibilitySettings =
        raw?.let { runCatching { JSON.decodeFromString(AccessibilitySettings.serializer(), it) }.getOrNull() }
            ?: AccessibilitySettings.DEFAULTS

    private companion object {
        private val KEY = stringPreferencesKey("me.meeshy.accessibilityPreferences")
        private val JSON = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    }
}
