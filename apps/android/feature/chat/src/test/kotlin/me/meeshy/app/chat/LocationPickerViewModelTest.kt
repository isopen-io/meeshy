package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.location.InMemoryLocationSharingPreferencesStore
import me.meeshy.sdk.location.LiveLocationFixSource
import me.meeshy.sdk.location.PlaceGeocoder
import me.meeshy.sdk.model.LiveLocationFix
import me.meeshy.sdk.model.LocationPrecision
import me.meeshy.sdk.model.LocationSharingPreferences
import me.meeshy.sdk.model.PlaceCoarseNames
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.GeocodedAddress
import me.meeshy.sdk.model.location.LocationAccess
import me.meeshy.sdk.model.location.LocationSearchResult
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LocationPickerViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private val paris = GeoPoint(48.85661, 2.35222)

    private class FakeGeocoder : PlaceGeocoder {
        val reversed = mutableListOf<GeoPoint>()
        val searched = mutableListOf<String>()
        var results = listOf<LocationSearchResult>()
        override suspend fun reverse(point: GeoPoint): GeocodedAddress {
            reversed += point
            return GeocodedAddress("Rue X, Paris", PlaceCoarseNames(locality = "Paris", country = "France"))
        }
        override suspend fun search(query: String, near: GeoPoint?, limit: Int): List<LocationSearchResult> {
            searched += query
            return results
        }
    }

    private class FakeFixes(var fix: LiveLocationFix? = LiveLocationFix(48.85661, 2.35222)) : LiveLocationFixSource {
        var calls = 0
        override suspend fun currentFix(): LiveLocationFix? { calls++; return fix }
        override fun updates(intervalMillis: Long): Flow<LiveLocationFix> = emptyFlow()
    }

    private fun vm(
        geocoder: FakeGeocoder = FakeGeocoder(),
        fixes: FakeFixes = FakeFixes(),
        prefs: LocationSharingPreferences = LocationSharingPreferences(),
    ) = LocationPickerViewModel(geocoder, fixes, InMemoryLocationSharingPreferencesStore(prefs))

    @Test
    fun `un refus de localisation affiche le bandeau sans demander de releve`() = runTest(dispatcher) {
        val fixes = FakeFixes()
        val vm = vm(fixes = fixes)

        vm.onAccessResolved(false)
        advanceUntilIdle()

        assertThat(vm.state.value.access).isEqualTo(LocationAccess.DENIED)
        assertThat(fixes.calls).isEqualTo(0)
        vm.recenter()
        advanceUntilIdle()
        assertThat(fixes.calls).isEqualTo(0)
    }

    @Test
    fun `l'acces accorde releve la position une fois, centre la carte et geocode`() = runTest(dispatcher) {
        val fixes = FakeFixes()
        val geocoder = FakeGeocoder()
        val vm = vm(geocoder, fixes)

        vm.onAccessResolved(true)
        advanceUntilIdle()

        assertThat(fixes.calls).isEqualTo(1)
        assertThat(vm.state.value.selected).isEqualTo(paris)
        assertThat(vm.state.value.address).isEqualTo("Rue X, Paris")
        assertThat(vm.target.value?.point).isEqualTo(paris)
        assertThat(vm.isLocating.value).isFalse()
    }

    @Test
    fun `une rafale de deplacements ne geocode que le dernier point`() = runTest(dispatcher) {
        val geocoder = FakeGeocoder()
        val vm = vm(geocoder)
        val a = GeoPoint(1.0, 1.0)
        val b = GeoPoint(2.0, 2.0)

        vm.onMapMoved(a)
        advanceTimeBy(100)
        vm.onMapMoved(b)
        advanceUntilIdle()

        assertThat(geocoder.reversed).containsExactly(b)
        assertThat(vm.state.value.selected).isEqualTo(b)
    }

    @Test
    fun `la recherche attend 300 ms et ne garde que la derniere requete`() = runTest(dispatcher) {
        val geocoder = FakeGeocoder().apply { results = listOf(LocationSearchResult(paris, "Louvre", "Paris")) }
        val vm = vm(geocoder)

        vm.onQueryChange("Lou")
        advanceTimeBy(100)
        vm.onQueryChange("Louvre")
        advanceUntilIdle()

        assertThat(geocoder.searched).containsExactly("Louvre")
        assertThat(vm.state.value.results).hasSize(1)
    }

    @Test
    fun `vider la recherche vide les resultats sans interroger le geocodeur`() = runTest(dispatcher) {
        val geocoder = FakeGeocoder().apply { results = listOf(LocationSearchResult(paris, "Louvre", null)) }
        val vm = vm(geocoder)
        vm.onQueryChange("Louvre"); advanceUntilIdle()

        vm.clearQuery(); advanceUntilIdle()

        assertThat(vm.state.value.results).isEmpty()
        assertThat(geocoder.searched).hasSize(1)
    }

    @Test
    fun `choisir un resultat pose la carte dessus et garde son nom`() = runTest(dispatcher) {
        val vm = vm()
        vm.choose(LocationSearchResult(paris, "Tour Eiffel", "Champ de Mars", "landmark"))
        advanceUntilIdle()
        vm.onMapMoved(paris)

        assertThat(vm.target.value?.point).isEqualTo(paris)
        assertThat(vm.state.value.name).isEqualTo("Tour Eiffel")
        assertThat(vm.state.value.category).isEqualTo("landmark")
        assertThat(vm.query.value).isEqualTo("Tour Eiffel")
    }

    @Test
    fun `confirmer envoie le lieu avec la precision choisie`() = runTest(dispatcher) {
        val vm = vm(prefs = LocationSharingPreferences(precision = LocationPrecision.CITY))
        val received = mutableListOf<SharedPlace>()
        val job = launch(dispatcher) { vm.confirmed.collect { received += it } }
        vm.onMapMoved(paris)
        advanceUntilIdle()

        vm.confirm()
        advanceUntilIdle()

        assertThat(received).hasSize(1)
        assertThat(received.single().latitude).isEqualTo(48.9)
        job.cancel()
    }

    @Test
    fun `confirmer sans point choisi n'envoie rien`() = runTest(dispatcher) {
        val vm = vm()
        val received = mutableListOf<SharedPlace>()
        val job = launch(dispatcher) { vm.confirmed.collect { received += it } }
        vm.confirm()
        advanceUntilIdle()
        assertThat(received).isEmpty()
        job.cancel()
    }

    @Test
    fun `reouvrir repart de zero`() = runTest(dispatcher) {
        val vm = vm()
        vm.onMapMoved(paris); vm.onQueryChange("x"); advanceUntilIdle()

        vm.open()

        assertThat(vm.state.value.selected).isNull()
        assertThat(vm.query.value).isEmpty()
        assertThat(vm.target.value).isNull()
    }
}
