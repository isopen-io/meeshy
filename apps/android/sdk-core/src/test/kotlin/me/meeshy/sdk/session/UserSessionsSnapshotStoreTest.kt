package me.meeshy.sdk.session

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.session.GeolocationAttribution
import me.meeshy.sdk.model.session.UserSession
import me.meeshy.sdk.model.session.UserSessionsPayload
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class UserSessionsSnapshotStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private fun payload() = UserSessionsPayload(
        sessions = listOf(
            UserSession(id = "me", isCurrentSession = true, city = "Paris", country = "FR"),
            UserSession(id = "tablet", deviceModel = "Pixel Tablet"),
        ),
        totalCount = 2,
        geolocation = GeolocationAttribution.DB_IP,
    )

    @Test
    fun `a new durable store is a cold cache`() = runTest(dataStores.dispatcher) {
        val store = DataStoreUserSessionsSnapshotStore(dataStores.preferences(tmp.newFile("s.preferences_pb")))

        assertThat(store.observe().first()).isNull()
        assertThat(store.lastSyncedAt().first()).isNull()
    }

    @Test
    fun `a saved snapshot round-trips with its sync instant`() = runTest(dataStores.dispatcher) {
        val store = DataStoreUserSessionsSnapshotStore(dataStores.preferences(tmp.newFile("s.preferences_pb")))

        store.save(payload(), 42L)

        assertThat(store.observe().first()).isEqualTo(payload())
        assertThat(store.lastSyncedAt().first()).isEqualTo(42L)
    }

    @Test
    fun `a corrupt payload reads as a cold cache`() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("s.preferences_pb"))
        dataStore.edit { it[stringPreferencesKey("sessions:payload")] = "{not json" }

        assertThat(DataStoreUserSessionsSnapshotStore(dataStore).observe().first()).isNull()
    }

    @Test
    fun `clear empties the durable snapshot`() = runTest(dataStores.dispatcher) {
        val store = DataStoreUserSessionsSnapshotStore(dataStores.preferences(tmp.newFile("s.preferences_pb")))
        store.save(payload(), 42L)

        store.clear()

        assertThat(store.observe().first()).isNull()
        assertThat(store.lastSyncedAt().first()).isNull()
    }

    @Test
    fun `the in-memory store clears too`() = runTest(dataStores.dispatcher) {
        val store = InMemoryUserSessionsSnapshotStore()
        store.save(payload(), 1L)

        store.clear()

        assertThat(store.observe().first()).isNull()
    }
}
