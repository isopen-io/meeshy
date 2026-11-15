package me.meeshy.app.contacts.circles

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.relation.CirclePerson
import me.meeshy.sdk.model.relation.SharedLocationBounds
import me.meeshy.sdk.model.relation.SharedLocationCircle
import me.meeshy.sdk.model.relation.SharedLocationEntry
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.relation.SharedLocationsGateway
import org.junit.After
import org.junit.Before
import org.junit.Test

/** La carte des positions qu'on me partage dans « Mes cercles » (#16985) — iso `SharedLocationsMapViewModelTests.swift`. */
@OptIn(ExperimentalCoroutinesApi::class)
class SharedLocationsMapViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val scope = TestScope(dispatcher)

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }

    @After fun tearDown() { Dispatchers.resetMain() }

    private class FakeLive(initial: Map<String, SharedLocationEntry> = emptyMap()) : SharedLocationsGateway {
        val state = MutableStateFlow(initial)
        val catchUps = mutableListOf<SharedLocationBounds?>()
        override val byUser: StateFlow<Map<String, SharedLocationEntry>> = state
        override suspend fun catchUp(bounds: SharedLocationBounds?) { catchUps += bounds }
    }

    private fun entry(precision: SharedLocationPrecision = SharedLocationPrecision.CITY, radius: Double = 12_000.0) =
        SharedLocationEntry(48.85, 2.35, precision, radius, SharedLocationCircle.FRIEND, 1L, 2L)

    private val paris = checkNotNull(SharedLocationBounds.of(2.0, 48.5, 2.6, 49.0))
    private val lyon = checkNotNull(SharedLocationBounds.of(4.7, 45.6, 5.0, 45.9))

    @Test
    fun `le magasin se peint des l'ouverture, puis l'epingle prend le nom de l'annuaire`() = scope.runTest {
        val live = FakeLive(mapOf("u2" to entry()))
        val asked = mutableListOf<List<String>>()
        val vm = SharedLocationsMapViewModel(live, { ids -> asked += ids; mapOf("u2" to CirclePerson("u2", "Awa Diop")) }, 300L)

        assertThat(vm.pins.value.single().name).isNull()
        advanceUntilIdle()

        assertThat(asked).containsExactly(listOf("u2"))
        assertThat(vm.pins.value.single().name).isEqualTo("Awa Diop")
        assertThat(vm.pins.value.single().initials).isEqualTo("AD")
    }

    @Test
    fun `une montee de precision servie affine l'epingle sans recharger, une fin la retire`() = scope.runTest {
        val live = FakeLive(mapOf("u2" to entry()))
        val vm = SharedLocationsMapViewModel(live, { emptyMap() }, 300L)
        advanceUntilIdle()

        live.state.value = mapOf("u2" to entry(SharedLocationPrecision.EXACT, 15.0))
        runCurrent()
        assertThat(vm.pins.value.single().precision).isEqualTo(SharedLocationPrecision.EXACT)
        assertThat(vm.pins.value.single().radiusMeters).isEqualTo(15.0)

        live.state.value = emptyMap()
        runCurrent()
        assertThat(vm.pins.value).isEmpty()
        assertThat(live.catchUps).isEmpty()
    }

    @Test
    fun `l'apparition rattrape le monde, un glisser ne rattrape que la derniere emprise apres le calme`() = scope.runTest {
        val live = FakeLive()
        val vm = SharedLocationsMapViewModel(live, { emptyMap() }, 300L)

        vm.appeared()
        runCurrent()
        vm.regionChanged(paris)
        advanceTimeBy(200)
        vm.regionChanged(lyon)
        advanceTimeBy(299)
        runCurrent()
        assertThat(live.catchUps).containsExactly(null)

        advanceTimeBy(2)
        runCurrent()
        assertThat(live.catchUps).containsExactly(null, lyon).inOrder()
    }
}
