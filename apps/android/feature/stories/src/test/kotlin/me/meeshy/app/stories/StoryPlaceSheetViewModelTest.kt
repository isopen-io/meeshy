package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.location.LiveLocationFixSource
import me.meeshy.sdk.location.PlaceGeocoder
import me.meeshy.sdk.model.LiveLocationFix
import me.meeshy.sdk.model.composer.NearbyAddress
import me.meeshy.sdk.model.location.AddressParts
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.LocationAccess
import me.meeshy.sdk.model.location.LocationSearchResult
import org.junit.After
import org.junit.Before
import org.junit.Test

/** La feuille « Lieu » de la story (#13846) : autour de moi après l'accord, rien après un refus, la recherche par nom toujours. */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryPlaceSheetViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val here = GeoPoint(48.8539, 2.3330)
    private val geocoder: PlaceGeocoder = mockk {
        coEvery { around(here, any()) } returns listOf(
            NearbyAddress(here, AddressParts(featureName = "172", thoroughfare = "Boulevard Saint-Germain", locality = "Paris")),
            NearbyAddress(GeoPoint(48.8541, 2.3326), AddressParts(featureName = "Café de Flore", thoroughfare = "Boulevard Saint-Germain", locality = "Paris")),
        )
        coEvery { search("gare", any(), any()) } returns listOf(LocationSearchResult(GeoPoint(48.88, 2.35), "Gare du Nord", "Paris"))
    }
    private val fixes: LiveLocationFixSource = mockk {
        coEvery { currentFix() } returns LiveLocationFix(latitude = here.latitude, longitude = here.longitude)
    }

    private fun viewModel() = StoryPlaceSheetViewModel(geocoder, fixes)

    @Test
    fun `granted access proposes the exact spot then the named places around, nothing chosen`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.open(hereName = "Ma position")
        vm.onAccessResolved(granted = true)
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.proposed.map { it.name }).containsExactly("172 Boulevard Saint-Germain", "Café de Flore").inOrder()
        assertThat(state.canConfirm).isFalse()

        vm.onChoose(state.proposed[1])
        assertThat(vm.state.value.canConfirm).isTrue()
    }

    @Test
    fun `a refusal proposes no place and never reads the position`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.open(hereName = "Ma position")
        vm.onAccessResolved(granted = false)
        advanceUntilIdle()

        assertThat(vm.state.value.access).isEqualTo(LocationAccess.DENIED)
        assertThat(vm.state.value.proposed).isEmpty()
        assertThat(vm.state.value.showsRefusal).isTrue()
        coVerify(exactly = 0) { fixes.currentFix() }
    }

    @Test
    fun `searching by name still works after a refusal`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.open(hereName = "Ma position")
        vm.onAccessResolved(granted = false)
        vm.onQueryChange("gare")
        advanceUntilIdle()

        assertThat(vm.state.value.proposed.map { it.name }).containsExactly("Gare du Nord")
    }
}
