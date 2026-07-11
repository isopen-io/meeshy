package me.meeshy.sdk.privacy

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
import me.meeshy.sdk.model.PrivacyPreferences
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * The privacy-preference persistence seam (feature-parity §L).
 * [InMemoryPrivacyPreferencesStore] is the volatile store used by tests/previews;
 * [DataStorePrivacyPreferencesStore] is the durable DataStore-backed one that survives process
 * death, hydrates on construction, and self-heals from a corrupt stored value.
 */
class PrivacyPreferencesStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun newDataStore(scope: CoroutineScope, file: File): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = scope) { file }

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
    fun dataStore_defaultsToTheDefaultBlockOnEmptyStore() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStorePrivacyPreferencesStore(newDataStore(scope, tmp.newFile("empty.preferences_pb")), scope)
        try {
            val value = withTimeout(15_000) { store.preferences.first() }
            assertThat(value).isEqualTo(PrivacyPreferences())
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_setPreferences_isReflectedInTheFlow() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStorePrivacyPreferencesStore(newDataStore(scope, tmp.newFile("set.preferences_pb")), scope)
        try {
            store.setPreferences(PrivacyPreferences(showOnlineStatus = false, blockScreenshots = true))
            val value = withTimeout(15_000) { store.preferences.first { it.blockScreenshots } }
            assertThat(value.showOnlineStatus).isFalse()
            assertThat(value.blockScreenshots).isTrue()
            assertThat(value.allowAnalytics).isEqualTo(PrivacyPreferences().allowAnalytics)
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_hydratesAlreadyPersistedChoiceOnConstruction() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = newDataStore(scope, tmp.newFile("hydrate.preferences_pb"))
        try {
            val writer = DataStorePrivacyPreferencesStore(dataStore, scope)
            writer.setPreferences(PrivacyPreferences(allowAnalytics = false))
            withTimeout(15_000) { writer.preferences.first { !it.allowAnalytics } }

            val fresh = DataStorePrivacyPreferencesStore(dataStore, scope)
            val value = withTimeout(15_000) { fresh.preferences.first { !it.allowAnalytics } }
            assertThat(value.allowAnalytics).isFalse()
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_corruptStoredValue_degradesToDefaults() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = newDataStore(scope, tmp.newFile("corrupt.preferences_pb"))
        try {
            dataStore.edit { it[stringPreferencesKey("privacy_preferences")] = "{not json" }

            val store = DataStorePrivacyPreferencesStore(dataStore, scope)
            val value = withTimeout(15_000) { store.preferences.first() }
            assertThat(value).isEqualTo(PrivacyPreferences())
        } finally {
            scope.cancel()
        }
    }
}
