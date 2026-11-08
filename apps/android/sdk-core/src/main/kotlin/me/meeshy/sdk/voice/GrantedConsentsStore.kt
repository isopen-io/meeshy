package me.meeshy.sdk.voice

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.model.voice.ConsentPurpose
import me.meeshy.sdk.session.PerAccountCache

/**
 * Les consentements que la passerelle a CONFIRMÉS pour ce compte (`PUT` à l'octroi, `GET /me/consents` à la relecture) —
 * miroir de `UserPreferencesManager.grantedConsents` (iOS). Jamais une supposition : seul un octroi ou une relecture réussis écrivent.
 */
interface GrantedConsentsStore {
    val granted: StateFlow<Set<ConsentPurpose>>

    suspend fun replace(purposes: Set<ConsentPurpose>)
}

class InMemoryGrantedConsentsStore(initial: Set<ConsentPurpose> = emptySet()) : GrantedConsentsStore {
    private val state = MutableStateFlow(initial)
    override val granted: StateFlow<Set<ConsentPurpose>> = state.asStateFlow()

    override suspend fun replace(purposes: Set<ConsentPurpose>) {
        state.value = purposes
    }
}

class DataStoreGrantedConsentsStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : GrantedConsentsStore {
    override val granted: StateFlow<Set<ConsentPurpose>> =
        dataStore.data
            .map { prefs -> prefs[KEY].orEmpty().mapNotNull(ConsentPurpose::fromWire).toSet() }
            .stateIn(scope, SharingStarted.Eagerly, emptySet())

    override suspend fun replace(purposes: Set<ConsentPurpose>) {
        dataStore.edit { prefs -> prefs[KEY] = purposes.map { it.wire }.toSet() }
    }

    private companion object {
        private val KEY = stringSetPreferencesKey("granted_consents")
    }
}

/** Au changement de compte, les consentements du précédent ne sont pas hérités. */
class GrantedConsentsAccountReset(private val store: GrantedConsentsStore) : PerAccountCache {
    override suspend fun clear() {
        store.replace(emptySet())
    }
}
