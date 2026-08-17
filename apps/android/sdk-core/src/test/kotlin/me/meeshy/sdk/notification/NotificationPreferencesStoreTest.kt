package me.meeshy.sdk.notification

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The notification-preference persistence seam (feature-parity §L).
 * [InMemoryNotificationPreferencesStore] is the volatile store used by tests/previews;
 * [DataStoreNotificationPreferencesStore] is the durable DataStore-backed one that survives
 * process death, hydrates on construction, and self-heals from a corrupt stored value.
 *
 * The durable cases run on [TestDataStores] — an inline, deterministic scheduler — so no
 * assertion here is bounded by wall-clock time. See that class for why the previous
 * `Dispatchers.IO` + `withTimeout(15_000)` recipe was retired.
 */
class NotificationPreferencesStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

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
    fun dataStore_defaultsToTheDefaultBlockOnEmptyStore() = runTest(dataStores.dispatcher) {
        val store = DataStoreNotificationPreferencesStore(
            dataStores.preferences(tmp.newFile("empty.preferences_pb")),
            dataStores.scope,
        )

        assertThat(store.preferences.first()).isEqualTo(UserNotificationPreferences())
    }

    @Test
    fun dataStore_setPreferences_isReflectedInTheFlow() = runTest(dataStores.dispatcher) {
        val store = DataStoreNotificationPreferencesStore(
            dataStores.preferences(tmp.newFile("set.preferences_pb")),
            dataStores.scope,
        )

        store.setPreferences(UserNotificationPreferences(pushEnabled = false, vibrationEnabled = false))

        val value = store.preferences.first { !it.pushEnabled }
        assertThat(value.pushEnabled).isFalse()
        assertThat(value.vibrationEnabled).isFalse()
        assertThat(value.soundEnabled).isTrue()
    }

    @Test
    fun dataStore_hydratesAlreadyPersistedChoiceOnConstruction() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("hydrate.preferences_pb"))
        val writer = DataStoreNotificationPreferencesStore(dataStore, dataStores.scope)
        writer.setPreferences(UserNotificationPreferences(soundEnabled = false))
        writer.preferences.first { !it.soundEnabled }

        val fresh = DataStoreNotificationPreferencesStore(dataStore, dataStores.scope)

        assertThat(fresh.preferences.first { !it.soundEnabled }.soundEnabled).isFalse()
    }

    @Test
    fun dataStore_corruptStoredValue_degradesToDefaults() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("corrupt.preferences_pb"))
        dataStore.edit { it[stringPreferencesKey("notification_preferences")] = "{not json" }

        val store = DataStoreNotificationPreferencesStore(dataStore, dataStores.scope)

        assertThat(store.preferences.first()).isEqualTo(UserNotificationPreferences())
    }
}
