package me.meeshy.app.game.progression

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.progression.ProgressionNotice
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProgressionViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(testDispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private val syncErrors = mutableListOf<(Throwable) -> Unit>()

    private fun viewModel(source: Flow<CacheResult<ApiEngagementProgress>>, refresh: suspend () -> Unit = {}): ProgressionViewModel {
        val repository = mockk<EngagementProgressRepository>()
        every { repository.progress(any()) } answers {
            syncErrors += firstArg<(Throwable) -> Unit>()
            source
        }
        coEvery { repository.refresh() } coAnswers { refresh() }
        return ProgressionViewModel(repository, defaultDispatcher = testDispatcher)
    }

    private suspend fun ProgressionViewModel.settled(condition: (ProgressionUiState) -> Boolean) = state.first(condition)

    @Test
    fun `a froid le squelette paraît et aucune carte`() = runTest {
        val vm = viewModel(flowOf(CacheResult.Empty))

        val state = vm.settled { it.plan.showsSkeleton }

        assertThat(state.snapshot).isNull()
    }

    @Test
    fun `un instantane perime se peint tout de suite sans squelette`() = runTest {
        val vm = viewModel(flowOf(CacheResult.Stale(ApiEngagementProgress.empty, ageMillis = 1)))

        val state = vm.settled { it.snapshot != null }

        assertThat(state.plan.showsSkeleton).isFalse()
        assertThat(state.snapshot?.cards?.map { it.concept }).contains(ProgressionConcept.Level)
        assertThat(state.snapshot?.standing?.isEmpty).isTrue()
    }

    @Test
    fun `la coupure pendant la revalidation garde l instantane et le dit`() = runTest {
        val source = MutableSharedFlow<CacheResult<ApiEngagementProgress>>(replay = 1)
        val vm = viewModel(source)
        source.emit(CacheResult.Stale(ApiEngagementProgress.empty, ageMillis = 1))
        vm.settled { it.snapshot != null }

        syncErrors.last().invoke(IOException("hors ligne"))

        val state = vm.settled { ProgressionNotice.Offline(hasSnapshot = true) in it.plan.notices }
        assertThat(state.snapshot).isNotNull()
    }

    @Test
    fun `tirer pour rafraichir contre une passerelle qui echoue dit l erreur sans vider l ecran`() = runTest {
        val vm = viewModel(flowOf(CacheResult.Stale(ApiEngagementProgress.empty, ageMillis = 1))) { error("500") }
        vm.settled { it.snapshot != null }

        vm.refresh()

        val state = vm.settled { ProgressionNotice.Error in it.plan.notices }
        assertThat(state.snapshot).isNotNull()
        assertThat(state.isRefreshing).isFalse()
    }

    @Test
    fun `un refresh reussi efface l avis de coupure`() = runTest {
        val vm = viewModel(flowOf(CacheResult.Stale(ApiEngagementProgress.empty, ageMillis = 1)))
        vm.settled { it.snapshot != null }
        syncErrors.last().invoke(IOException("hors ligne"))
        vm.settled { it.plan.notices.any { notice -> notice is ProgressionNotice.Offline } }

        vm.refresh()

        val state = vm.settled { it.plan.notices.none { notice -> notice is ProgressionNotice.Offline } }
        assertThat(state.plan.notices).doesNotContain(ProgressionNotice.Error)
    }
}
