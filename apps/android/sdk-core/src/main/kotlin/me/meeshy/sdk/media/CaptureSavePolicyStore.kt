package me.meeshy.sdk.media

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.model.composer.capture.CaptureSavePolicy

/**
 * La politique d'enregistrement de la capture (Réglages › Médias › « À la prise de vue »),
 * miroir des clés `meeshy.capture.*` d'iOS. Source unique que le viseur, la retouche et
 * l'écran de réglages consultent ; une valeur absente ou corrompue retombe sur
 * [CaptureSavePolicy.Standard] (l'original n'est pas enregistré).
 */
public interface CaptureSavePolicyStore {
    public val policy: StateFlow<CaptureSavePolicy>

    public suspend fun setPolicy(policy: CaptureSavePolicy)
}

/** Volatile [CaptureSavePolicyStore] — tests et aperçus. */
public class InMemoryCaptureSavePolicyStore(
    initial: CaptureSavePolicy = CaptureSavePolicy.Standard,
) : CaptureSavePolicyStore {
    private val state = MutableStateFlow(initial)
    override val policy: StateFlow<CaptureSavePolicy> = state.asStateFlow()

    override suspend fun setPolicy(policy: CaptureSavePolicy) {
        state.value = policy
    }
}

/** [CaptureSavePolicyStore] durable, adossé à un Preferences [DataStore]. */
public class DataStoreCaptureSavePolicyStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : CaptureSavePolicyStore {

    override val policy: StateFlow<CaptureSavePolicy> =
        dataStore.data
            .map { prefs -> CaptureSavePolicy.fromStorage(prefs[SAVES_ORIGINAL], prefs[RENDERED_MODE]) }
            .stateIn(scope, SharingStarted.Eagerly, CaptureSavePolicy.Standard)

    override suspend fun setPolicy(policy: CaptureSavePolicy) {
        dataStore.edit { prefs ->
            prefs[SAVES_ORIGINAL] = policy.savesOriginal
            prefs[RENDERED_MODE] = policy.renderedMode.storageValue
        }
    }

    private companion object {
        private val SAVES_ORIGINAL = booleanPreferencesKey("meeshy.capture.saveOriginalToPhotos")
        private val RENDERED_MODE = stringPreferencesKey("meeshy.capture.renderedSaveMode")
    }
}
