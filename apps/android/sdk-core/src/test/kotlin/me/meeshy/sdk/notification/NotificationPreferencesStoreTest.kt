package me.meeshy.sdk.notification

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
import me.meeshy.sdk.model.UserNotificationPreferences
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * The notification-preference persistence seam (feature-parity §L).
 * [InMemoryNotificationPreferencesStore] is the volatile store used by tests/previews;
 * [DataStoreNotificationPreferencesStore] is the durable DataStore-backed one that survives
 * process death, hydrates on construction, and self-heals from a corrupt stored value.
 *
 * `withTimeout(15_000)` on real DataStore-Flow collection (`runBlocking`, real
 * wall-clock time — not `runTest`'s virtual clock): `5_000` flaked repeatedly
 * under CI-runner disk-I/O load (`TimeoutCancellationException`, no relation to
 * the diff under test each time). `15_000` matches the value
 * [me.meeshy.sdk.media.MediaDownloadPreferencesStoreTest]/
 * [me.meeshy.sdk.privacy.PrivacyPreferencesStoreTest] already use without
 * incident — never observed to flake at that threshold in this session.
 */
class NotificationPreferencesStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun newDataStore(scope: CoroutineScope, file: File): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = scope) { file }

    // ---- InMemoryNotificationPreferencesStore (pure behaviour) ----

    @Test
    fun inMemory_defaultsToTheDefaultBlock() {
        assertThat(InMemoryNotificationPreferencesStore().preferences.value)
            .isEqualTo(UserNotificationPreferences())
    }

    @Test
    fun inMemory_honoursInitialSeed() {
        val seed = UserNotificationPreferences(pushEnabled = false, soundEnabled = false)
        assertThat(InMemoryNotificationPreferencesStore(seed).preferences.value).isEqualTo(seed)
    }

    @Test
    fun inMemory_setPreferences_updatesTheFlow() = runBlocking {
        val store = InMemoryNotificationPreferencesStore()
        store.preferences.test {
            assertThat(awaitItem().pushEnabled).isTrue()
            store.setPreferences(UserNotificationPreferences(pushEnabled = false))
            assertThat(awaitItem().pushEnabled).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ---- DataStoreNotificationPreferencesStore (durable) ----

    @Test
    fun dataStore_defaultsToTheDefaultBlockOnEmptyStore() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreNotificationPreferencesStore(newDataStore(scope, tmp.newFile("empty.preferences_pb")), scope)
        try {
            val value = withTimeout(15_000) { store.preferences.first() }
            assertThat(value).isEqualTo(UserNotificationPreferences())
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_setPreferences_isReflectedInTheFlow() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreNotificationPreferencesStore(newDataStore(scope, tmp.newFile("set.preferences_pb")), scope)
        try {
            store.setPreferences(UserNotificationPreferences(pushEnabled = false, vibrationEnabled = false))
            val value = withTimeout(15_000) { store.preferences.first { !it.pushEnabled } }
            assertThat(value.pushEnabled).isFalse()
            assertThat(value.vibrationEnabled).isFalse()
            assertThat(value.soundEnabled).isTrue()
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_hydratesAlreadyPersistedChoiceOnConstruction() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = newDataStore(scope, tmp.newFile("hydrate.preferences_pb"))
        try {
            val writer = DataStoreNotificationPreferencesStore(dataStore, scope)
            writer.setPreferences(UserNotificationPreferences(soundEnabled = false))
            withTimeout(15_000) { writer.preferences.first { !it.soundEnabled } }

            val fresh = DataStoreNotificationPreferencesStore(dataStore, scope)
            val value = withTimeout(15_000) { fresh.preferences.first { !it.soundEnabled } }
            assertThat(value.soundEnabled).isFalse()
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun dataStore_corruptStoredValue_degradesToDefaults() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = newDataStore(scope, tmp.newFile("corrupt.preferences_pb"))
        try {
            dataStore.edit { it[stringPreferencesKey("notification_preferences")] = "{not json" }

            val store = DataStoreNotificationPreferencesStore(dataStore, scope)
            val value = withTimeout(15_000) { store.preferences.first() }
            assertThat(value).isEqualTo(UserNotificationPreferences())
        } finally {
            scope.cancel()
        }
    }
}
