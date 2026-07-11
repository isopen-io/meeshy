package me.meeshy.sdk.media

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
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaDownloadPreferences
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * The media-auto-download persistence seam (feature-parity §L).
 * [InMemoryMediaDownloadPreferencesStore] is the volatile store used by tests/previews;
 * [DataStoreMediaDownloadPreferencesStore] is the durable DataStore-backed one that survives
 * process death, hydrates on construction, and self-heals from a corrupt stored value.
 */
class MediaDownloadPreferencesStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun newDataStore(scope: CoroutineScope, file: File): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = scope) { file }

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
    fun dataStore_defaultsToTheDefaultBlockOnEmptyStore() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreMediaDownloadPreferencesStore(newDataStore(scope, tmp.newFile("empty.preferences_pb")), scope)
        try {
            val value = withTimeout(15_000) { store.preferences.first() }
            assertThat(value).isEqualTo(MediaDownloadPreferences())
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_setPreferences_isReflectedInTheFlow() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreMediaDownloadPreferencesStore(newDataStore(scope, tmp.newFile("set.preferences_pb")), scope)
        try {
            store.setPreferences(
                MediaDownloadPreferences(image = AutoDownloadPolicy.NEVER, video = AutoDownloadPolicy.ALWAYS),
            )
            val value = withTimeout(15_000) { store.preferences.first { it.video == AutoDownloadPolicy.ALWAYS } }
            assertThat(value.image).isEqualTo(AutoDownloadPolicy.NEVER)
            assertThat(value.video).isEqualTo(AutoDownloadPolicy.ALWAYS)
            assertThat(value.audio).isEqualTo(MediaDownloadPreferences().audio)
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_hydratesAlreadyPersistedChoiceOnConstruction() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = newDataStore(scope, tmp.newFile("hydrate.preferences_pb"))
        try {
            val writer = DataStoreMediaDownloadPreferencesStore(dataStore, scope)
            writer.setPreferences(MediaDownloadPreferences(audio = AutoDownloadPolicy.NEVER))
            withTimeout(15_000) { writer.preferences.first { it.audio == AutoDownloadPolicy.NEVER } }

            val fresh = DataStoreMediaDownloadPreferencesStore(dataStore, scope)
            val value = withTimeout(15_000) { fresh.preferences.first { it.audio == AutoDownloadPolicy.NEVER } }
            assertThat(value.audio).isEqualTo(AutoDownloadPolicy.NEVER)
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_corruptStoredValue_degradesToDefaults() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = newDataStore(scope, tmp.newFile("corrupt.preferences_pb"))
        try {
            dataStore.edit { it[stringPreferencesKey("media_download_preferences")] = "{not json" }

            val store = DataStoreMediaDownloadPreferencesStore(dataStore, scope)
            val value = withTimeout(15_000) { store.preferences.first() }
            assertThat(value).isEqualTo(MediaDownloadPreferences())
        } finally {
            scope.cancel()
        }
    }
}
