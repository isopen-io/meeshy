package me.meeshy.sdk.session

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.session.UserSessionsPayload

/**
 * Le dernier relevé des appareils connectés (`GET /auth/sessions`), durable, avec l'instant de sa dernière
 * synchronisation. Un [observe] nul est un cache froid (jamais synchronisé, ou charge illisible).
 * Le magasin est lié au compte : [clear] le vide à la déconnexion, un second compte n'en hérite jamais.
 */
public interface UserSessionsSnapshotStore : PerAccountCache {
    /** Le relevé ET son instant lus ENSEMBLE : jamais une liste neuve appariée à l'ancien instant. */
    public fun snapshot(): Flow<Pair<UserSessionsPayload?, Long?>>

    public fun observe(): Flow<UserSessionsPayload?> = snapshot().map { it.first }

    public fun lastSyncedAt(): Flow<Long?> = snapshot().map { it.second }

    public suspend fun save(payload: UserSessionsPayload, syncedAtMillis: Long)
}

/** Volatile [UserSessionsSnapshotStore] — pour les tests et les aperçus. */
public class InMemoryUserSessionsSnapshotStore : UserSessionsSnapshotStore {
    private val entry = MutableStateFlow<Pair<UserSessionsPayload, Long>?>(null)

    override fun snapshot(): Flow<Pair<UserSessionsPayload?, Long?>> =
        entry.asStateFlow().map { it?.first to it?.second }

    override suspend fun save(payload: UserSessionsPayload, syncedAtMillis: Long) {
        entry.update { payload to syncedAtMillis }
    }

    override suspend fun clear() {
        entry.update { null }
    }
}

/** [UserSessionsSnapshotStore] sur un [DataStore] : la charge en JSON et l'instant, sans migration Room. */
public class DataStoreUserSessionsSnapshotStore(
    private val dataStore: DataStore<Preferences>,
    private val json: Json = Json { ignoreUnknownKeys = true; explicitNulls = false },
) : UserSessionsSnapshotStore {

    override fun snapshot(): Flow<Pair<UserSessionsPayload?, Long?>> =
        dataStore.data.map { prefs ->
            val payload = prefs[PAYLOAD]?.let { raw ->
                runCatching { json.decodeFromString(UserSessionsPayload.serializer(), raw) }.getOrNull()
            }
            payload to prefs[SYNCED]
        }

    override suspend fun save(payload: UserSessionsPayload, syncedAtMillis: Long) {
        val raw = json.encodeToString(UserSessionsPayload.serializer(), payload)
        dataStore.edit { prefs ->
            prefs[PAYLOAD] = raw
            prefs[SYNCED] = syncedAtMillis
        }
    }

    override suspend fun clear() {
        dataStore.edit { it.clear() }
    }

    private companion object {
        val PAYLOAD = stringPreferencesKey("sessions:payload")
        val SYNCED = longPreferencesKey("sessions:synced")
    }
}
