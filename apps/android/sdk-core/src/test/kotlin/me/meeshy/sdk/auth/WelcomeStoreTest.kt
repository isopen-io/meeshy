package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class WelcomeStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    @Test
    fun `un drapeau absent vaut accueil non solde`() = runTest(dataStores.dispatcher) {
        val store = DataStoreWelcomeStore(dataStores.preferences(tmp.newFile("w1.preferences_pb")))

        assertThat(store.isSettled.first()).isFalse()
    }

    @Test
    fun `solder est durable et idempotent`() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("w2.preferences_pb"))
        val store = DataStoreWelcomeStore(backing)

        store.settle()
        store.settle()

        assertThat(DataStoreWelcomeStore(backing).isSettled.first()).isTrue()
    }

    @Test
    fun `le magasin volatil se solde aussi`() = runTest {
        val store = InMemoryWelcomeStore()

        store.settle()

        assertThat(store.isSettled.first()).isTrue()
    }
}
