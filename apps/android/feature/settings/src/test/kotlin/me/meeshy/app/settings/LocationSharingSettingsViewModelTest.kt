package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.location.InMemoryLocationSharingPreferencesStore
import me.meeshy.sdk.model.LocationPrecision
import me.meeshy.sdk.model.LocationSharingPreferences
import me.meeshy.sdk.model.SharedMapStyle
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LocationSharingSettingsViewModelTest {

    @Before
    fun setUp() = Dispatchers.setMain(StandardTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `la feuille expose les preferences du magasin`() = runTest {
        val store = InMemoryLocationSharingPreferencesStore(
            LocationSharingPreferences(LocationPrecision.CITY, SharedMapStyle.HYBRID),
        )
        val vm = LocationSharingSettingsViewModel(store)

        assertThat(vm.preferences.value.precision).isEqualTo(LocationPrecision.CITY)
        assertThat(vm.preferences.value.mapStyle).isEqualTo(SharedMapStyle.HYBRID)
    }

    @Test
    fun `choisir une precision et un style les ecrit dans le magasin`() = runTest {
        val store = InMemoryLocationSharingPreferencesStore()
        val vm = LocationSharingSettingsViewModel(store)

        vm.setPrecision(LocationPrecision.NEIGHBORHOOD)
        vm.setMapStyle(SharedMapStyle.IMAGERY)
        advanceUntilIdle()

        assertThat(store.preferences.value)
            .isEqualTo(LocationSharingPreferences(LocationPrecision.NEIGHBORHOOD, SharedMapStyle.IMAGERY))
        assertThat(vm.preferences.value.precision).isEqualTo(LocationPrecision.NEIGHBORHOOD)
    }
}
