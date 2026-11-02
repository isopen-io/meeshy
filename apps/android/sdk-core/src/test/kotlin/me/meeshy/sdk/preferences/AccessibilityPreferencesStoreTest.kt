package me.meeshy.sdk.preferences

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.accessibility.AccessibilitySettings
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

@OptIn(ExperimentalCoroutinesApi::class)
class AccessibilityPreferencesStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private val key = stringPreferencesKey("me.meeshy.accessibilityPreferences")

    @Test
    fun `par defaut rien n'est reduit`() = runTest(dataStores.dispatcher) {
        val store = DataStoreAccessibilityPreferencesStore(
            dataStores.preferences(tmp.newFile("a.preferences_pb")), dataStores.scope,
        )
        assertThat(store.settings.value.reduceMotion).isFalse()
    }

    @Test
    fun `un changement est visible tout de suite puis persiste apres 100 ms`() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("b.preferences_pb"))
        val store = DataStoreAccessibilityPreferencesStore(dataStore, dataStores.scope)

        store.update { it.copy(reduceMotion = true) }

        assertThat(store.settings.value.reduceMotion).isTrue()
        dataStores.dispatcher.scheduler.advanceTimeBy(99)
        assertThat(dataStore.data.first()[key]).isNull()
        dataStores.dispatcher.scheduler.advanceTimeBy(2)
        dataStores.dispatcher.scheduler.advanceUntilIdle()
        assertThat(dataStore.data.first()[key]).contains("true")
    }

    @Test
    fun `plusieurs changements rapprochés ne produisent qu'une ecriture avec la derniere valeur`() =
        runTest(dataStores.dispatcher) {
            val dataStore = dataStores.preferences(tmp.newFile("c.preferences_pb"))
            val store = DataStoreAccessibilityPreferencesStore(dataStore, dataStores.scope)

            store.update { it.copy(reduceMotion = true) }
            dataStores.dispatcher.scheduler.advanceTimeBy(50)
            store.update { it.copy(reduceMotion = false) }
            dataStores.dispatcher.scheduler.advanceTimeBy(200)
            dataStores.dispatcher.scheduler.advanceUntilIdle()

            assertThat(dataStore.data.first()[key]).contains("false")
        }

    @Test
    fun `le choix persiste est relu par une nouvelle instance`() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("d.preferences_pb"))
        DataStoreAccessibilityPreferencesStore(dataStore, dataStores.scope)
            .update { it.copy(reduceMotion = true) }
        dataStores.dispatcher.scheduler.advanceTimeBy(300)
        dataStores.dispatcher.scheduler.advanceUntilIdle()

        val fresh = DataStoreAccessibilityPreferencesStore(dataStore, dataStores.scope)

        assertThat(fresh.settings.first { it.reduceMotion }.reduceMotion).isTrue()
    }

    @Test
    fun `une valeur illisible retombe sur les defauts`() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("e.preferences_pb"))
        dataStore.edit { it[key] = "{not json" }

        val store = DataStoreAccessibilityPreferencesStore(dataStore, dataStores.scope)

        assertThat(store.settings.value).isEqualTo(AccessibilitySettings.DEFAULTS)
    }

    @Test
    fun `le magasin volatile propage le changement`() {
        val store = InMemoryAccessibilityPreferencesStore()
        store.update { it.copy(reduceMotion = true) }
        assertThat(store.settings.value.reduceMotion).isTrue()
    }
}
