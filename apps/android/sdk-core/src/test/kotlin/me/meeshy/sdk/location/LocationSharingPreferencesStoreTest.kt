package me.meeshy.sdk.location

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.LocationPrecision
import me.meeshy.sdk.model.LocationSharingPreferences
import me.meeshy.sdk.model.SharedMapStyle
import me.meeshy.sdk.model.SharedPlace
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
        writer.preferences.first { it.precision == LocationPrecision.NEIGHBORHOOD }

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
    fun `degrade applique la precision choisie avant envoi`() = runTest {
        val store = InMemoryLocationSharingPreferencesStore()
        store.setPrecision(LocationPrecision.CITY)
        val out = store.degrade(SharedPlace(latitude = 48.8566, longitude = 2.3522))
        assertThat(out.latitude).isEqualTo(48.9)
        assertThat(out.longitude).isEqualTo(2.4)
    }
}
