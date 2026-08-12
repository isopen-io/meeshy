package me.meeshy.sdk.category

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
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.CategoryOption

/**
 * Durable snapshot of the user's conversation-category catalogue — the persistence
 * seam behind iOS `UserCategoryStore`'s cached snapshot (`loadCachedCategories` /
 * `persist`). It owns bytes only: a serialized [CategoryOption] list plus the epoch
 * millis of the last successful network sync. Whether to hydrate cache-first and
 * when to revalidate is the `CategoryRepository`'s job, not this store's.
 *
 * A `null` [observe] emission means a **cold** cache (never synced) — distinct from a
 * synced-but-empty catalogue (an empty list), so the SWR classifier can tell a
 * first-run skeleton from a user who genuinely has no categories.
 */
public interface CategorySnapshotStore {
    /** The cached catalogue, or `null` when nothing has ever been synced (cold). */
    public fun observe(): Flow<List<CategoryOption>?>

    /** Epoch millis of the last successful [save], or `null` when never synced. */
    public fun lastSyncedAt(): Flow<Long?>

    /** Replaces the cached snapshot and records [syncedAtMillis] as the sync time. */
    public suspend fun save(categories: List<CategoryOption>, syncedAtMillis: Long)

    /**
     * Wipes the snapshot back to a cold, never-synced cache — the account-teardown
     * seam ([me.meeshy.sdk.session.SessionTeardown]): a second account signing in on
     * the same device must never inherit the previous account's category catalogue.
     */
    public suspend fun clearAll()
}

/** Volatile [CategorySnapshotStore] — for tests and previews. */
public class InMemoryCategorySnapshotStore(
    initial: List<CategoryOption>? = null,
    initialSyncedAt: Long? = null,
) : CategorySnapshotStore {
    private val snapshot: MutableStateFlow<List<CategoryOption>?> = MutableStateFlow(initial)
    private val syncedAt: MutableStateFlow<Long?> = MutableStateFlow(initialSyncedAt)

    override fun observe(): Flow<List<CategoryOption>?> = snapshot.asStateFlow()

    override fun lastSyncedAt(): Flow<Long?> = syncedAt.asStateFlow()

    override suspend fun save(categories: List<CategoryOption>, syncedAtMillis: Long) {
        snapshot.update { categories }
        syncedAt.update { syncedAtMillis }
    }

    override suspend fun clearAll() {
        snapshot.update { null }
        syncedAt.update { null }
    }
}

/**
 * [Preferences]-[DataStore]-backed [CategorySnapshotStore]. The catalogue is stored as
 * a single JSON blob; a corrupt/legacy blob decodes to an empty (but non-null, i.e.
 * synced) list so a decode failure degrades to "no categories" rather than a
 * perpetual cold skeleton.
 */
public class DataStoreCategorySnapshotStore(
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
) : CategorySnapshotStore {

    private val serializer = ListSerializer(CategoryOption.serializer())

    override fun observe(): Flow<List<CategoryOption>?> =
        dataStore.data.map { prefs ->
            // Cold until the first sync stamps SYNCED_AT — a missing snapshot with a
            // stamp is a real empty catalogue, not a cold cache.
            if (prefs[SYNCED_AT] == null) null else decode(prefs[SNAPSHOT])
        }

    override fun lastSyncedAt(): Flow<Long?> =
        dataStore.data.map { prefs -> prefs[SYNCED_AT] }

    override suspend fun save(categories: List<CategoryOption>, syncedAtMillis: Long) {
        dataStore.edit { prefs ->
            prefs[SNAPSHOT] = json.encodeToString(serializer, categories)
            prefs[SYNCED_AT] = syncedAtMillis
        }
    }

    override suspend fun clearAll() {
        dataStore.edit { prefs -> prefs.clear() }
    }

    private fun decode(raw: String?): List<CategoryOption> =
        raw?.let { runCatching { json.decodeFromString(serializer, it) }.getOrNull() } ?: emptyList()

    private companion object {
        private val SNAPSHOT = stringPreferencesKey("categories_snapshot")
        private val SYNCED_AT = longPreferencesKey("categories_synced_at")
    }
}
