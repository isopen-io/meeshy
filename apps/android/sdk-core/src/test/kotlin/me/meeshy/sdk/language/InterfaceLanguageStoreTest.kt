package me.meeshy.sdk.language

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * The interface-language persistence seam (feature-parity §L). [InMemoryInterfaceLanguageStore]
 * is the volatile store used by tests/previews; [DataStoreInterfaceLanguageStore] is the durable
 * DataStore-backed one that survives process death, hydrates on construction, and decodes through
 * the pure codec so a corrupt/legacy persisted token degrades to "System" (`null`) not a crash.
 *
 * `null` is the "follow the device locale" (System) preference throughout.
 */
class InterfaceLanguageStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun newDataStore(scope: CoroutineScope, file: File): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = scope) { file }

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
    fun dataStore_defaultsToSystemOnEmptyStore() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreInterfaceLanguageStore(
            newDataStore(scope, tmp.newFile("empty.preferences_pb")), scope,
        )
        try {
            val value = withTimeout(5_000) { store.languageCode.first() }
            assertThat(value).isNull()
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_setLanguageCode_isReflectedInTheFlow() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreInterfaceLanguageStore(
            newDataStore(scope, tmp.newFile("set.preferences_pb")), scope,
        )
        try {
            store.setLanguageCode("ar")
            val value = withTimeout(5_000) { store.languageCode.first { it == "ar" } }
            assertThat(value).isEqualTo("ar")
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_hydratesAlreadyPersistedChoiceOnConstruction() = runBlocking {
        // DataStore enforces one active instance per file per process, so the two store
        // wrappers share one durable DataStore. The point under test is that a *freshly
        // constructed* store hydrates the already-persisted choice rather than emitting the
        // System default — the "no flash of the wrong language on cold start" guarantee.
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = newDataStore(scope, tmp.newFile("hydrate.preferences_pb"))
        try {
            val writer = DataStoreInterfaceLanguageStore(dataStore, scope)
            writer.setLanguageCode("es")
            withTimeout(5_000) { writer.languageCode.first { it == "es" } }

            val fresh = DataStoreInterfaceLanguageStore(dataStore, scope)
            val value = withTimeout(5_000) { fresh.languageCode.first { it == "es" } }
            assertThat(value).isEqualTo("es")
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_decodesCorruptPersistedTokenToSystem() = runBlocking {
        // A legacy/corrupt raw token written directly (bypassing the codec) must decode to
        // System (null), never crash or stick the app in an unshippable language.
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = newDataStore(scope, tmp.newFile("corrupt.preferences_pb"))
        try {
            dataStore.edit { it[stringPreferencesKey("interface_language")] = "klingon" }
            val store = DataStoreInterfaceLanguageStore(dataStore, scope)
            val value = withTimeout(5_000) { store.languageCode.first() }
            assertThat(value).isNull()
        } finally {
            scope.cancel()
        }
    }
}
