package me.meeshy.sdk.theme

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import me.meeshy.sdk.model.AppThemeMode
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * The theme persistence seam (feature-parity §L). [InMemoryThemeStore] is the
 * volatile store used by tests/previews; [DataStoreThemeStore] is the durable
 * DataStore-backed one that survives process death and hydrates on construction.
 */
class ThemeStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun newDataStore(scope: CoroutineScope, file: File): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = scope) { file }

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
    fun dataStore_defaultsToAutoOnEmptyStore() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreThemeStore(newDataStore(scope, tmp.newFile("empty.preferences_pb")), scope)
        try {
            val value = withTimeout(5_000) { store.themeMode.first() }
            assertThat(value).isEqualTo(AppThemeMode.AUTO)
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_setThemeMode_isReflectedInTheFlow() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreThemeStore(newDataStore(scope, tmp.newFile("set.preferences_pb")), scope)
        try {
            store.setThemeMode(AppThemeMode.DARK)
            val value = withTimeout(5_000) { store.themeMode.first { it == AppThemeMode.DARK } }
            assertThat(value).isEqualTo(AppThemeMode.DARK)
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_hydratesAlreadyPersistedChoiceOnConstruction() = runBlocking {
        // DataStore enforces one active instance per file per process, so the two
        // store wrappers share one durable DataStore. The point under test is that a
        // *freshly constructed* store hydrates the already-persisted choice rather
        // than emitting the AUTO default — the "no flash of the wrong theme on cold
        // start" guarantee.
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = newDataStore(scope, tmp.newFile("hydrate.preferences_pb"))
        try {
            val writer = DataStoreThemeStore(dataStore, scope)
            writer.setThemeMode(AppThemeMode.LIGHT)
            withTimeout(5_000) { writer.themeMode.first { it == AppThemeMode.LIGHT } }

            val fresh = DataStoreThemeStore(dataStore, scope)
            val value = withTimeout(5_000) { fresh.themeMode.first { it == AppThemeMode.LIGHT } }
            assertThat(value).isEqualTo(AppThemeMode.LIGHT)
        } finally {
            scope.cancel()
        }
    }
}
