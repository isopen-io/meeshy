package me.meeshy.sdk.privacy

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The privacy-preference persistence seam (feature-parity §L).
 * [InMemoryPrivacyPreferencesStore] is the volatile store used by tests/previews;
 * [DataStorePrivacyPreferencesStore] is the durable DataStore-backed one that survives process
 * death, hydrates on construction, and self-heals from a corrupt stored value.
 *
 * The durable cases run on [TestDataStores] — an inline, deterministic scheduler — so no
 * assertion here is bounded by wall-clock time. See that class for why the previous
 * `Dispatchers.IO` + `withTimeout(15_000)` recipe was retired.
 */
class PrivacyPreferencesStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    // ---- InMemoryPrivacyPreferencesStore (pure behaviour) ----

    @Test
    fun inMemory_defaultsToTheDefaultBlock() {
        assertThat(InMemoryPrivacyPreferencesStore().preferences.value)
            .isEqualTo(PrivacyPreferences())
    }

    @Test
    fun inMemory_honoursInitialSeed() {
        val seed = PrivacyPreferences(showOnlineStatus = false, blockScreenshots = true)
        assertThat(InMemoryPrivacyPreferencesStore(seed).preferences.value).isEqualTo(seed)
    }

    @Test
    fun inMemory_setPreferences_updatesTheFlow() = runBlocking {
        val store = InMemoryPrivacyPreferencesStore()
        store.preferences.test {
            assertThat(awaitItem().blockScreenshots).isFalse()
            store.setPreferences(PrivacyPreferences(blockScreenshots = true))
            assertThat(awaitItem().blockScreenshots).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---- DataStorePrivacyPreferencesStore (durable) ----

    @Test
    fun dataStore_defaultsToTheDefaultBlockOnEmptyStore() = runTest(dataStores.dispatcher) {
        val store = DataStorePrivacyPreferencesStore(
            dataStores.preferences(tmp.newFile("empty.preferences_pb")),
            dataStores.scope,
        )

        assertThat(store.preferences.first()).isEqualTo(PrivacyPreferences())
    }

    @Test
    fun dataStore_setPreferences_isReflectedInTheFlow() = runTest(dataStores.dispatcher) {
        val store = DataStorePrivacyPreferencesStore(
            dataStores.preferences(tmp.newFile("set.preferences_pb")),
            dataStores.scope,
        )

        store.setPreferences(PrivacyPreferences(showOnlineStatus = false, blockScreenshots = true))

        val value = store.preferences.first { it.blockScreenshots }
        assertThat(value.showOnlineStatus).isFalse()
        assertThat(value.blockScreenshots).isTrue()
        assertThat(value.allowAnalytics).isEqualTo(PrivacyPreferences().allowAnalytics)
    }

    @Test
    fun dataStore_hydratesAlreadyPersistedChoiceOnConstruction() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("hydrate.preferences_pb"))
        val writer = DataStorePrivacyPreferencesStore(dataStore, dataStores.scope)
        writer.setPreferences(PrivacyPreferences(allowAnalytics = false))
        writer.preferences.first { !it.allowAnalytics }

        val fresh = DataStorePrivacyPreferencesStore(dataStore, dataStores.scope)

        assertThat(fresh.preferences.first { !it.allowAnalytics }.allowAnalytics).isFalse()
    }

    @Test
    fun dataStore_corruptStoredValue_degradesToDefaults() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("corrupt.preferences_pb"))
        dataStore.edit { it[stringPreferencesKey("privacy_preferences")] = "{not json" }

        val store = DataStorePrivacyPreferencesStore(dataStore, dataStores.scope)

        assertThat(store.preferences.first()).isEqualTo(PrivacyPreferences())
    }
}
