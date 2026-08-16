package me.meeshy.sdk.media

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The media-auto-download persistence seam (feature-parity §L).
 * [InMemoryMediaDownloadPreferencesStore] is the volatile store used by tests/previews;
 * [DataStoreMediaDownloadPreferencesStore] is the durable DataStore-backed one that survives
 * process death, hydrates on construction, and self-heals from a corrupt stored value.
 *
 * The durable cases run on [TestDataStores] — an inline, deterministic scheduler — so no
 * assertion here is bounded by wall-clock time. See that class for why the previous
 * `Dispatchers.IO` + `withTimeout(15_000)` recipe was retired.
 */
class MediaDownloadPreferencesStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    // ---- InMemoryMediaDownloadPreferencesStore (pure behaviour) ----

    @Test
    fun inMemory_defaultsToTheDefaultBlock() {
        assertThat(InMemoryMediaDownloadPreferencesStore().preferences.value)
            .isEqualTo(MediaDownloadPreferences())
    }

    @Test
    fun inMemory_honoursInitialSeed() {
        val seed = MediaDownloadPreferences(video = AutoDownloadPolicy.ALWAYS)
        assertThat(InMemoryMediaDownloadPreferencesStore(seed).preferences.value).isEqualTo(seed)
    }

    @Test
    fun inMemory_setPreferences_updatesTheFlow() = runBlocking {
        val store = InMemoryMediaDownloadPreferencesStore()
        store.preferences.test {
            assertThat(awaitItem().video).isEqualTo(AutoDownloadPolicy.WIFI_ONLY)
            store.setPreferences(MediaDownloadPreferences(video = AutoDownloadPolicy.ALWAYS))
            assertThat(awaitItem().video).isEqualTo(AutoDownloadPolicy.ALWAYS)
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---- DataStoreMediaDownloadPreferencesStore (durable) ----

    @Test
    fun dataStore_defaultsToTheDefaultBlockOnEmptyStore() = runTest(dataStores.dispatcher) {
        val store = DataStoreMediaDownloadPreferencesStore(
            dataStores.preferences(tmp.newFile("empty.preferences_pb")),
            dataStores.scope,
        )

        assertThat(store.preferences.first()).isEqualTo(MediaDownloadPreferences())
    }

    @Test
    fun dataStore_setPreferences_isReflectedInTheFlow() = runTest(dataStores.dispatcher) {
        val store = DataStoreMediaDownloadPreferencesStore(
            dataStores.preferences(tmp.newFile("set.preferences_pb")),
            dataStores.scope,
        )

        store.setPreferences(
            MediaDownloadPreferences(image = AutoDownloadPolicy.NEVER, video = AutoDownloadPolicy.ALWAYS),
        )

        val value = store.preferences.first { it.video == AutoDownloadPolicy.ALWAYS }
        assertThat(value.image).isEqualTo(AutoDownloadPolicy.NEVER)
        assertThat(value.video).isEqualTo(AutoDownloadPolicy.ALWAYS)
        assertThat(value.audio).isEqualTo(MediaDownloadPreferences().audio)
    }

    @Test
    fun dataStore_hydratesAlreadyPersistedChoiceOnConstruction() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("hydrate.preferences_pb"))
        val writer = DataStoreMediaDownloadPreferencesStore(dataStore, dataStores.scope)
        writer.setPreferences(MediaDownloadPreferences(audio = AutoDownloadPolicy.NEVER))
        writer.preferences.first { it.audio == AutoDownloadPolicy.NEVER }

        val fresh = DataStoreMediaDownloadPreferencesStore(dataStore, dataStores.scope)

        val value = fresh.preferences.first { it.audio == AutoDownloadPolicy.NEVER }
        assertThat(value.audio).isEqualTo(AutoDownloadPolicy.NEVER)
    }

    @Test
    fun dataStore_corruptStoredValue_degradesToDefaults() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("corrupt.preferences_pb"))
        dataStore.edit { it[stringPreferencesKey("media_download_preferences")] = "{not json" }

        val store = DataStoreMediaDownloadPreferencesStore(dataStore, dataStores.scope)

        assertThat(store.preferences.first()).isEqualTo(MediaDownloadPreferences())
    }
}
