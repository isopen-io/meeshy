package me.meeshy.sdk.audio

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
import me.meeshy.sdk.model.AudioPreferences
import me.meeshy.sdk.model.audioPreferencesFromStorage
import me.meeshy.sdk.model.storageValue
import me.meeshy.sdk.session.PerAccountCache

/**
 * Le bloc audio de l'utilisateur (iOS `UserPreferencesManager.audio`) : la source de vérité de
 * l'appareil, qui se peint à l'instant et s'hydrate au démarrage à froid sans éclair de défauts.
 * La synchronisation vers la passerelle est l'affaire de [AudioPreferencesSyncRepository].
 */
public interface AudioPreferencesStore {
    public val preferences: StateFlow<AudioPreferences>

    public suspend fun setPreferences(preferences: AudioPreferences)
}

/** Magasin volatil — tests et aperçus. */
public class InMemoryAudioPreferencesStore(
    initial: AudioPreferences = AudioPreferences(),
) : AudioPreferencesStore {
    private val state = MutableStateFlow(initial)
    override val preferences: StateFlow<AudioPreferences> = state.asStateFlow()

    override suspend fun setPreferences(preferences: AudioPreferences) {
        state.value = preferences
    }
}

/** Magasin `DataStore` ; le jeton passe par le codec pur, un jeton corrompu retombe sur les défauts. */
public class DataStoreAudioPreferencesStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : AudioPreferencesStore {

    override val preferences: StateFlow<AudioPreferences> =
        dataStore.data
            .map { prefs -> audioPreferencesFromStorage(prefs[KEY]) }
            .stateIn(scope, SharingStarted.Eagerly, AudioPreferences())

    override suspend fun setPreferences(preferences: AudioPreferences) {
        dataStore.edit { prefs -> prefs[KEY] = preferences.storageValue }
    }

    private companion object {
        private val KEY = stringPreferencesKey("audio_preferences")
    }
}

/** Au changement de compte, le bloc audio du précédent repart aux défauts : le suivant ne l'hérite pas. */
public class AudioPreferencesAccountReset(
    private val store: AudioPreferencesStore,
) : PerAccountCache {
    override suspend fun clear() {
        store.setPreferences(AudioPreferences())
    }
}
