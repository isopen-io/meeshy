package me.meeshy.app.calls

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.call.CallQualityStatsFeed
import me.meeshy.sdk.model.call.CallQualityGrade
import me.meeshy.sdk.model.call.CallQualityMetric
import me.meeshy.sdk.model.call.CallQualityTick
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallQualityDetailViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private fun tick(atMs: Long = 0, loss: Double = 0.0, rtt: Double = 40.0, relayed: Boolean? = null) =
        CallQualityTick(atMs, rtt, loss, 5.0, 0, 0, relayed)

    @Test
    fun `avant la premiere lecture l'etat est vide et attend la mesure`() = runTest {
        val vm = CallQualityDetailViewModel(CallQualityStatsFeed())
        vm.onEvent(CallQualityDetailUiEvent.Start)
        assertThat(vm.state.value.isWaitingForFirstReading).isTrue()
        assertThat(vm.state.value.overall).isNull()
    }

    @Test
    fun `une lecture donne cinq rangees, la note globale et la route`() = runTest {
        val feed = CallQualityStatsFeed()
        val vm = CallQualityDetailViewModel(feed)
        vm.onEvent(CallQualityDetailUiEvent.Start)
        feed.record(tick(loss = 6.0, relayed = true))
        val state = vm.state.value
        assertThat(state.rows.map { it.metric }).containsExactlyElementsIn(CallQualityMetric.entries).inOrder()
        assertThat(state.overall).isEqualTo(CallQualityGrade.POOR)
        assertThat(state.network?.relayed).isTrue()
    }

    @Test
    fun `les valeurs suivent le flux en direct tant que la feuille est abonnee`() = runTest {
        val feed = CallQualityStatsFeed()
        val vm = CallQualityDetailViewModel(feed)
        vm.state.test {
            assertThat(awaitItem().isWaitingForFirstReading).isTrue()
            vm.onEvent(CallQualityDetailUiEvent.Start)
            feed.record(tick(loss = 0.0))
            assertThat(awaitItem().overall).isEqualTo(CallQualityGrade.GOOD)
            feed.record(tick(atMs = 1000, loss = 4.0))
            assertThat(awaitItem().overall).isEqualTo(CallQualityGrade.MEDIUM)
        }
    }

    @Test
    fun `apres Stop plus aucune mise a jour n'arrive`() = runTest {
        val feed = CallQualityStatsFeed()
        val vm = CallQualityDetailViewModel(feed)
        vm.onEvent(CallQualityDetailUiEvent.Start)
        feed.record(tick(loss = 0.0))
        vm.onEvent(CallQualityDetailUiEvent.Stop)
        feed.record(tick(atMs = 1000, loss = 9.0))
        assertThat(vm.state.value.overall).isEqualTo(CallQualityGrade.GOOD)
    }

    @Test
    fun `Start deux fois ne double pas l'abonnement et la fin d'appel vide l'etat`() = runTest {
        val feed = CallQualityStatsFeed()
        val vm = CallQualityDetailViewModel(feed)
        vm.onEvent(CallQualityDetailUiEvent.Start)
        vm.onEvent(CallQualityDetailUiEvent.Start)
        feed.record(tick())
        assertThat(vm.state.value.rows).isNotEmpty()
        feed.reset()
        assertThat(vm.state.value.isWaitingForFirstReading).isTrue()
    }
}
