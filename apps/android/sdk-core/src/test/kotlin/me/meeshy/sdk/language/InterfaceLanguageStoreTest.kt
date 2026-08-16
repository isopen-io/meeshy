package me.meeshy.sdk.language

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The interface-language persistence seam (feature-parity §L). [InMemoryInterfaceLanguageStore]
 * is the volatile store used by tests/previews; [DataStoreInterfaceLanguageStore] is the durable
 * DataStore-backed one that survives process death, hydrates on construction, and decodes through
 * the pure codec so a corrupt/legacy persisted token degrades to "System" (`null`) not a crash.
 *
 * `null` is the "follow the device locale" (System) preference throughout.
 *
 * The durable cases run on [TestDataStores] — an inline, deterministic scheduler — so no
 * assertion here is bounded by wall-clock time. See that class for why the previous
 * `Dispatchers.IO` + `withTimeout(15_000)` recipe was retired.
 */
class InterfaceLanguageStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    // ---- InMemoryInterfaceLanguageStore (pure behaviour) ----

    @Test
    fun inMemory_defaultsToSystem() {
        assertThat(InMemoryInterfaceLanguageStore().languageCode.value).isNull()
    }

    @Test
    fun inMemory_honoursSupportedInitialSeed() {
        assertThat(InMemoryInterfaceLanguageStore("fr").languageCode.value).isEqualTo("fr")
    }

    @Test
    fun inMemory_normalisesGarbageInitialSeedToSystem() {
        assertThat(InMemoryInterfaceLanguageStore("de").languageCode.value).isNull()
        assertThat(InMemoryInterfaceLanguageStore("").languageCode.value).isNull()
    }

    @Test
    fun inMemory_setLanguageCode_updatesTheFlow() = runBlocking {
        val store = InMemoryInterfaceLanguageStore()
        store.languageCode.test {
            assertThat(awaitItem()).isNull()
            store.setLanguageCode("es")
            assertThat(awaitItem()).isEqualTo("es")
            store.setLanguageCode(null)
            assertThat(awaitItem()).isNull()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun inMemory_setUnsupportedCode_fallsBackToSystem() = runBlocking {
        val store = InMemoryInterfaceLanguageStore("fr")
        store.setLanguageCode("de")
        assertThat(store.languageCode.value).isNull()
    }

    // ---- DataStoreInterfaceLanguageStore (durable) ----

    @Test
    fun dataStore_defaultsToSystemOnEmptyStore() = runTest(dataStores.dispatcher) {
        val store = DataStoreInterfaceLanguageStore(
            dataStores.preferences(tmp.newFile("empty.preferences_pb")),
            dataStores.scope,
        )

        assertThat(store.languageCode.first()).isNull()
    }

    @Test
    fun dataStore_setLanguageCode_isReflectedInTheFlow() = runTest(dataStores.dispatcher) {
        val store = DataStoreInterfaceLanguageStore(
            dataStores.preferences(tmp.newFile("set.preferences_pb")),
            dataStores.scope,
        )

        store.setLanguageCode("ar")

        assertThat(store.languageCode.first { it == "ar" }).isEqualTo("ar")
    }

    @Test
    fun dataStore_hydratesAlreadyPersistedChoiceOnConstruction() = runTest(dataStores.dispatcher) {
        // DataStore enforces one active instance per file per process, so the two store
        // wrappers share one durable DataStore. The point under test is that a *freshly
        // constructed* store hydrates the already-persisted choice rather than emitting the
        // System default — the "no flash of the wrong language on cold start" guarantee.
        val dataStore = dataStores.preferences(tmp.newFile("hydrate.preferences_pb"))
        val writer = DataStoreInterfaceLanguageStore(dataStore, dataStores.scope)
        writer.setLanguageCode("es")
        writer.languageCode.first { it == "es" }

        val fresh = DataStoreInterfaceLanguageStore(dataStore, dataStores.scope)

        assertThat(fresh.languageCode.first { it == "es" }).isEqualTo("es")
    }

    @Test
    fun dataStore_decodesCorruptPersistedTokenToSystem() = runTest(dataStores.dispatcher) {
        // A legacy/corrupt raw token written directly (bypassing the codec) must decode to
        // System (null), never crash or stick the app in an unshippable language.
        val dataStore = dataStores.preferences(tmp.newFile("corrupt.preferences_pb"))
        dataStore.edit { it[stringPreferencesKey("interface_language")] = "klingon" }

        val store = DataStoreInterfaceLanguageStore(dataStore, dataStores.scope)

        assertThat(store.languageCode.first()).isNull()
    }
}
