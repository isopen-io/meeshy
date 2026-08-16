package me.meeshy.sdk.theme

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The theme persistence seam (feature-parity §L). [InMemoryThemeStore] is the
 * volatile store used by tests/previews; [DataStoreThemeStore] is the durable
 * DataStore-backed one that survives process death and hydrates on construction.
 *
 * The durable cases run on [TestDataStores] — an inline, deterministic scheduler —
 * so no assertion here is bounded by wall-clock time. See that class for why the
 * previous `Dispatchers.IO` + `withTimeout(15_000)` recipe was retired.
 */
class ThemeStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    // ---- InMemoryThemeStore (pure behaviour) ----

    @Test
    fun inMemory_defaultsToAuto() {
        assertThat(InMemoryThemeStore().themeMode.value).isEqualTo(AppThemeMode.AUTO)
    }

    @Test
    fun inMemory_honoursInitialSeed() {
        assertThat(InMemoryThemeStore(AppThemeMode.DARK).themeMode.value).isEqualTo(AppThemeMode.DARK)
    }

    @Test
    fun inMemory_setThemeMode_updatesTheFlow() = runBlocking {
        val store = InMemoryThemeStore()
        store.themeMode.test {
            assertThat(awaitItem()).isEqualTo(AppThemeMode.AUTO)
            store.setThemeMode(AppThemeMode.LIGHT)
            assertThat(awaitItem()).isEqualTo(AppThemeMode.LIGHT)
            store.setThemeMode(AppThemeMode.DARK)
            assertThat(awaitItem()).isEqualTo(AppThemeMode.DARK)
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---- DataStoreThemeStore (durable) ----

    @Test
    fun dataStore_defaultsToAutoOnEmptyStore() = runTest(dataStores.dispatcher) {
        val store = DataStoreThemeStore(
            dataStores.preferences(tmp.newFile("empty.preferences_pb")),
            dataStores.scope,
        )

        assertThat(store.themeMode.first()).isEqualTo(AppThemeMode.AUTO)
    }

    @Test
    fun dataStore_setThemeMode_isReflectedInTheFlow() = runTest(dataStores.dispatcher) {
        val store = DataStoreThemeStore(
            dataStores.preferences(tmp.newFile("set.preferences_pb")),
            dataStores.scope,
        )

        store.setThemeMode(AppThemeMode.DARK)

        assertThat(store.themeMode.first { it == AppThemeMode.DARK }).isEqualTo(AppThemeMode.DARK)
    }

    @Test
    fun dataStore_hydratesAlreadyPersistedChoiceOnConstruction() = runTest(dataStores.dispatcher) {
        // DataStore enforces one active instance per file per process, so the two
        // store wrappers share one durable DataStore. The point under test is that a
        // *freshly constructed* store hydrates the already-persisted choice rather
        // than emitting the AUTO default — the "no flash of the wrong theme on cold
        // start" guarantee.
        val dataStore = dataStores.preferences(tmp.newFile("hydrate.preferences_pb"))
        val writer = DataStoreThemeStore(dataStore, dataStores.scope)
        writer.setThemeMode(AppThemeMode.LIGHT)
        writer.themeMode.first { it == AppThemeMode.LIGHT }

        val fresh = DataStoreThemeStore(dataStore, dataStores.scope)

        assertThat(fresh.themeMode.first { it == AppThemeMode.LIGHT }).isEqualTo(AppThemeMode.LIGHT)
    }
}
