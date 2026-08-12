package me.meeshy.sdk.category

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.CategoryOption
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * The category-catalogue snapshot persistence seam.
 * [InMemoryCategorySnapshotStore] is the volatile variant used by tests/previews;
 * [DataStoreCategorySnapshotStore] is the durable one that survives process death and
 * self-heals from a corrupt stored blob (degrading to a synced-but-empty catalogue,
 * never a perpetual cold cache).
 */
class CategorySnapshotStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true }

    private fun newDataStore(scope: CoroutineScope, file: File): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = scope) { file }

    private fun cat(id: String, name: String, order: Int? = null) =
        CategoryOption(id = id, name = name, order = order)

    // ── InMemoryCategorySnapshotStore ────────────────────────────────────────

    @Test
    fun inMemory_isColdByDefault() = runBlocking {
        val store = InMemoryCategorySnapshotStore()
        assertThat(store.observe().first()).isNull()
        assertThat(store.lastSyncedAt().first()).isNull()
    }

    @Test
    fun inMemory_honoursItsInitialSeed() = runBlocking {
        val store = InMemoryCategorySnapshotStore(initial = listOf(cat("a", "A")), initialSyncedAt = 7L)
        assertThat(store.observe().first()).containsExactly(cat("a", "A"))
        assertThat(store.lastSyncedAt().first()).isEqualTo(7L)
    }

    @Test
    fun inMemory_saveReplacesSnapshotAndStampsSyncTime() = runBlocking {
        val store = InMemoryCategorySnapshotStore()
        store.save(listOf(cat("x", "X", order = 3)), syncedAtMillis = 55L)
        assertThat(store.observe().first()).containsExactly(cat("x", "X", order = 3))
        assertThat(store.lastSyncedAt().first()).isEqualTo(55L)
    }

    @Test
    fun inMemory_clearAll_resetsToAColdCache() = runBlocking {
        val store = InMemoryCategorySnapshotStore(initial = listOf(cat("a", "A")), initialSyncedAt = 7L)

        store.clearAll()

        assertThat(store.observe().first()).isNull()
        assertThat(store.lastSyncedAt().first()).isNull()
    }

    // ── DataStoreCategorySnapshotStore ───────────────────────────────────────

    @Test
    fun dataStore_isColdOnAnEmptyStore() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val store = DataStoreCategorySnapshotStore(newDataStore(scope, tmp.newFile("cold.preferences_pb")), json)
            assertThat(withTimeout(5_000) { store.observe().first() }).isNull()
            assertThat(store.lastSyncedAt().first()).isNull()
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_saveRoundTripsSnapshotAndSyncTime() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val store = DataStoreCategorySnapshotStore(newDataStore(scope, tmp.newFile("save.preferences_pb")), json)
            store.save(listOf(cat("work", "Work", order = 0), cat("fam", "Family", order = 1)), syncedAtMillis = 999L)

            assertThat(withTimeout(5_000) { store.observe().first() }).containsExactly(
                cat("work", "Work", order = 0),
                cat("fam", "Family", order = 1),
            ).inOrder()
            assertThat(store.lastSyncedAt().first()).isEqualTo(999L)
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_syncedButEmptyReadsAsEmptyNotCold() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val store = DataStoreCategorySnapshotStore(newDataStore(scope, tmp.newFile("empty.preferences_pb")), json)
            store.save(emptyList(), syncedAtMillis = 12L)

            assertThat(withTimeout(5_000) { store.observe().first() }).isEqualTo(emptyList<CategoryOption>())
            assertThat(store.lastSyncedAt().first()).isEqualTo(12L)
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_clearAll_resetsToAColdCache() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val store = DataStoreCategorySnapshotStore(newDataStore(scope, tmp.newFile("clear.preferences_pb")), json)
            store.save(listOf(cat("work", "Work")), syncedAtMillis = 999L)

            store.clearAll()

            assertThat(withTimeout(5_000) { store.observe().first() }).isNull()
            assertThat(store.lastSyncedAt().first()).isNull()
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_corruptSnapshotDegradesToEmptyButStaysSynced() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = newDataStore(scope, tmp.newFile("corrupt.preferences_pb"))
        try {
            dataStore.edit { prefs ->
                prefs[stringPreferencesKey("categories_snapshot")] = "{not json"
                prefs[longPreferencesKey("categories_synced_at")] = 34L
            }

            val store = DataStoreCategorySnapshotStore(dataStore, json)
            // A stamp is present, so this is a real (empty) catalogue, not a cold cache.
            assertThat(withTimeout(5_000) { store.observe().first() }).isEqualTo(emptyList<CategoryOption>())
            assertThat(store.lastSyncedAt().first()).isEqualTo(34L)
        } finally {
            scope.cancel()
        }
    }
}
