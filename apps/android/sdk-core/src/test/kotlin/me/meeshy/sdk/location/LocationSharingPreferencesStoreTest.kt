package me.meeshy.sdk.location

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.LocationPrecision
import me.meeshy.sdk.model.LocationSharingPreferences
import me.meeshy.sdk.model.SharedMapStyle
import me.meeshy.sdk.model.SharedPlace
import app.cash.turbine.test
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class LocationSharingPreferencesStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    @Test
    fun `par defaut le niveau est exact comme sur iOS`() = runTest(dataStores.dispatcher) {
        val store = DataStoreLocationSharingPreferencesStore(
            dataStores.preferences(tmp.newFile("empty.preferences_pb")),
            dataStores.scope,
        )
        assertThat(store.preferences.first()).isEqualTo(LocationSharingPreferences())
    }

    @Test
    fun `le choix persiste apres redemarrage`() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("persist.preferences_pb"))
        val writer = DataStoreLocationSharingPreferencesStore(dataStore, dataStores.scope)
        writer.setPrecision(LocationPrecision.NEIGHBORHOOD)
        writer.setMapStyle(SharedMapStyle.HYBRID)
        advanceTimeBy(LocationSharingPreferencesStore.WRITE_DEBOUNCE_MS + 1)

        val fresh = DataStoreLocationSharingPreferencesStore(dataStore, dataStores.scope)

        val value = fresh.preferences.first { it.precision == LocationPrecision.NEIGHBORHOOD }
        assertThat(value.mapStyle).isEqualTo(SharedMapStyle.HYBRID)
    }

    @Test
    fun `une valeur illisible retombe sur les defauts`() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("corrupt.preferences_pb"))
        dataStore.edit { it[stringPreferencesKey("location_precision")] = "bogus" }
        val store = DataStoreLocationSharingPreferencesStore(dataStore, dataStores.scope)
        assertThat(store.preferences.first().precision).isEqualTo(LocationPrecision.EXACT)
    }

    @Test
    fun `un fichier illisible retombe sur les defauts sans planter`() = runTest(dataStores.dispatcher) {
        val file = tmp.newFile("garbage.preferences_pb")
        file.writeBytes(byteArrayOf(0x7F, 0x01, 0x02, 0x03, 0x55, 0x66, 0x77, 0x13, 0x37))
        val store = DataStoreLocationSharingPreferencesStore(dataStores.preferences(file), dataStores.scope)

        assertThat(store.preferences.first()).isEqualTo(LocationSharingPreferences())
    }

    @Test
    fun `un style inconnu d'une version future retombe sur plan sans toucher a la precision`() =
        runTest(dataStores.dispatcher) {
            val dataStore = dataStores.preferences(tmp.newFile("future.preferences_pb"))
            dataStore.edit {
                it[stringPreferencesKey("location_precision")] = "city"
                it[stringPreferencesKey("location_map_style")] = "terrain-3d"
            }
            val store = DataStoreLocationSharingPreferencesStore(dataStore, dataStores.scope)

            val value = store.preferences.first { it.precision == LocationPrecision.CITY }
            assertThat(value.mapStyle).isEqualTo(SharedMapStyle.STANDARD)
        }

    @Test
    fun `le choix est publie tout de suite et l'ecriture est debouncee a 100 ms`() =
        runTest(dataStores.dispatcher) {
            val dataStore = dataStores.preferences(tmp.newFile("debounce.preferences_pb"))
            val store = DataStoreLocationSharingPreferencesStore(dataStore, dataStores.scope)

            store.setPrecision(LocationPrecision.AROUND)
            store.setPrecision(LocationPrecision.NEIGHBORHOOD)
            store.setPrecision(LocationPrecision.CITY)

            assertThat(store.preferences.value.precision).isEqualTo(LocationPrecision.CITY)
            assertThat(dataStore.data.first()[stringPreferencesKey("location_precision")]).isNull()

            advanceTimeBy(LocationSharingPreferencesStore.WRITE_DEBOUNCE_MS - 1)
            assertThat(dataStore.data.first()[stringPreferencesKey("location_precision")]).isNull()

            advanceTimeBy(2)
            assertThat(dataStore.data.first()[stringPreferencesKey("location_precision")]).isEqualTo("city")
        }

    @Test
    fun `une rafale de taps ne produit qu'une seule ecriture`() = runTest(dataStores.dispatcher) {
        val dataStore = dataStores.preferences(tmp.newFile("burst.preferences_pb"))
        val store = DataStoreLocationSharingPreferencesStore(dataStore, dataStores.scope)
        var writes = 0
        val counter = launch(dataStores.dispatcher) {
            dataStore.data.collect { writes += 1 }
        }
        val baseline = writes

        LocationPrecision.entries.forEach { store.setPrecision(it) }
        advanceTimeBy(LocationSharingPreferencesStore.WRITE_DEBOUNCE_MS + 1)

        assertThat(writes - baseline).isEqualTo(1)
        counter.cancel()
    }

    @Test
    fun `le flux publie chaque changement aux observateurs`() = runTest(dataStores.dispatcher) {
        val store = DataStoreLocationSharingPreferencesStore(
            dataStores.preferences(tmp.newFile("flow.preferences_pb")),
            dataStores.scope,
        )
        store.preferences.test {
            assertThat(awaitItem()).isEqualTo(LocationSharingPreferences())
            store.setMapStyle(SharedMapStyle.IMAGERY)
            assertThat(awaitItem().mapStyle).isEqualTo(SharedMapStyle.IMAGERY)
            store.setPrecision(LocationPrecision.AROUND)
            assertThat(awaitItem().precision).isEqualTo(LocationPrecision.AROUND)
            advanceTimeBy(LocationSharingPreferencesStore.WRITE_DEBOUNCE_MS + 1)
            expectNoEvents()
        }
    }

    @Test
    fun `degrade applique la precision choisie avant envoi`() = runTest {
        val store = InMemoryLocationSharingPreferencesStore()
        store.setPrecision(LocationPrecision.CITY)
        val out = store.degrade(SharedPlace(latitude = 48.8566, longitude = 2.3522))
        assertThat(out.latitude).isEqualTo(48.9)
        assertThat(out.longitude).isEqualTo(2.4)
    }
}
