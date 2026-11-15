package me.meeshy.sdk.preferences

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

/**
 * Durable, keyed JSON snapshots of the account-level preference reads (the whole aggregate,
 * the user's conversation tags, one conversation's row, category fold state) with the epoch
 * millis of their last successful sync — the persistence seam behind iOS `CacheCoordinator`'s
 * `userPreferences` / `userTags` / `conversationPreferences` stores.
 *
 * A `null` [observe] means a cold key (never synced); the owner decides when to revalidate.
 */
public interface PreferenceSnapshotStore {
    public fun observe(key: String): Flow<String?>

    public fun lastSyncedAt(key: String): Flow<Long?>

    public suspend fun save(key: String, payload: String, syncedAtMillis: Long)

    /** Wipes every key — the account-teardown seam: a second account never inherits these. */
    public suspend fun clearAll()
}

/** Volatile [PreferenceSnapshotStore] — for tests and previews. */
public class InMemoryPreferenceSnapshotStore : PreferenceSnapshotStore {
    private val entries = MutableStateFlow<Map<String, Pair<String, Long>>>(emptyMap())

    override fun observe(key: String): Flow<String?> = entries.asStateFlow().map { it[key]?.first }

    override fun lastSyncedAt(key: String): Flow<Long?> = entries.asStateFlow().map { it[key]?.second }

    override suspend fun save(key: String, payload: String, syncedAtMillis: Long) {
        entries.update { it + (key to (payload to syncedAtMillis)) }
    }

    override suspend fun clearAll() {
        entries.update { emptyMap() }
    }
}

/** [DataStore]-backed [PreferenceSnapshotStore]: one string and one long key per snapshot key. */
public class DataStorePreferenceSnapshotStore(
    private val dataStore: DataStore<Preferences>,
) : PreferenceSnapshotStore {

    override fun observe(key: String): Flow<String?> =
        dataStore.data.map { it[stringPreferencesKey("payload:$key")] }

    override fun lastSyncedAt(key: String): Flow<Long?> =
        dataStore.data.map { it[longPreferencesKey("synced:$key")] }

    override suspend fun save(key: String, payload: String, syncedAtMillis: Long) {
        dataStore.edit { prefs ->
            prefs[stringPreferencesKey("payload:$key")] = payload
            prefs[longPreferencesKey("synced:$key")] = syncedAtMillis
        }
    }

    override suspend fun clearAll() {
        dataStore.edit { it.clear() }
    }
}
