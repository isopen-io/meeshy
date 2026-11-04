package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ActivationInviteDayStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private val noon = 1_793_707_200_000L // 2026-11-03T12:00:00Z

    @Test
    fun `rien de montre au depart`() = runTest(dataStores.dispatcher) {
        val store = DataStoreActivationInviteDayStore(dataStores.preferences(tmp.newFile("a1.preferences_pb")), { ZoneId.of("UTC") })
        assertThat(store.wasShownToday(noon)).isFalse()
    }

    @Test
    fun `montree aujourd'hui, durable, puis un nouveau jour la rouvre`() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("a2.preferences_pb"))
        DataStoreActivationInviteDayStore(backing, { ZoneId.of("UTC") }).markShown(noon)

        val reopened = DataStoreActivationInviteDayStore(backing, { ZoneId.of("UTC") })
        assertThat(reopened.wasShownToday(noon + 3_600_000L)).isTrue()
        assertThat(reopened.wasShownToday(noon + 86_400_000L)).isFalse()
    }

    @Test
    fun `un changement de fuseau change le jour civil`() = runTest(dataStores.dispatcher) {
        var zone = ZoneId.of("UTC")
        val store = DataStoreActivationInviteDayStore(dataStores.preferences(tmp.newFile("a3.preferences_pb")), { zone })
        store.markShown(noon)
        zone = ZoneId.of("Pacific/Auckland") // 2026-11-04 01:00 locale
        assertThat(store.wasShownToday(noon)).isFalse()
    }

    @Test
    fun `la version en memoire suit la meme loi`() = runTest {
        val store = InMemoryActivationInviteDayStore { ZoneId.of("UTC") }
        assertThat(store.wasShownToday(noon)).isFalse()
        store.markShown(noon)
        assertThat(store.wasShownToday(noon)).isTrue()
    }
}
