package me.meeshy.sdk.media

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/**
 * Réglages › Médias › « Conserver le lieu des photos » (`OutgoingImageLocationSetting` d'iOS, #11247, #12905) :
 * **désactivé par défaut**, préférence de l'APPAREIL, même clé qu'iOS. Tant que la lecture durable n'a pas
 * répondu, la valeur est `false` : un lieu ne part jamais par retard de lecture.
 */
public interface OutgoingPhotoLocationStore {
    public val keepsLocation: StateFlow<Boolean>

    public suspend fun setKeepsLocation(keeps: Boolean)

    public companion object {
        public const val KEY: String = "media.outgoing.keepsPhotoLocation"
        public const val STANDARD: Boolean = false
    }
}

/** Volatile — tests et aperçus. */
public class InMemoryOutgoingPhotoLocationStore(
    initial: Boolean = OutgoingPhotoLocationStore.STANDARD,
) : OutgoingPhotoLocationStore {
    private val state = MutableStateFlow(initial)
    override val keepsLocation: StateFlow<Boolean> = state.asStateFlow()

    override suspend fun setKeepsLocation(keeps: Boolean) {
        state.value = keeps
    }
}

/** Durable, adossé à un Preferences [DataStore]. */
public class DataStoreOutgoingPhotoLocationStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : OutgoingPhotoLocationStore {
    override val keepsLocation: StateFlow<Boolean> =
        dataStore.data
            .map { prefs -> prefs[KEEPS] ?: OutgoingPhotoLocationStore.STANDARD }
            .stateIn(scope, SharingStarted.Eagerly, OutgoingPhotoLocationStore.STANDARD)

    override suspend fun setKeepsLocation(keeps: Boolean) {
        dataStore.edit { prefs -> prefs[KEEPS] = keeps }
    }

    private companion object {
        private val KEEPS = booleanPreferencesKey(OutgoingPhotoLocationStore.KEY)
    }
}
