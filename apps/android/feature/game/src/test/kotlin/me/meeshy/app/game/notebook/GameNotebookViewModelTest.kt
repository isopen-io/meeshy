package me.meeshy.app.game.notebook

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.PhotoCatchUpStanding
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * La Chronique (iOS `GameNotebookViewModel`) se lit dans le cache de la progression, jamais derrière un spinner : à
 * froid, le squelette ; un cache, même périmé, se peint tout de suite ; froid ET hors ligne, l'état vide, jamais un
 * squelette qui attend sans fin.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GameNotebookViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(testDispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private val syncErrors = mutableListOf<(Throwable) -> Unit>()

    private fun viewModel(source: Flow<CacheResult<ApiEngagementProgress>>): GameNotebookViewModel {
        val repository = mockk<EngagementProgressRepository>()
        every { repository.progress(any()) } answers {
            syncErrors += firstArg<(Throwable) -> Unit>()
            source
        }
        return GameNotebookViewModel(repository, defaultDispatcher = testDispatcher)
    }

    @Test
    fun `a froid la chronique montre son squelette`() = runTest {
        val vm = viewModel(flowOf(CacheResult.Empty))

        val state = vm.state.first { it.phase == GameNotebookPhase.Loading }

        assertThat(state.catchUp).isEmpty()
        assertThat(state.isEmpty).isFalse()
    }

    @Test
    fun `froid et hors ligne la chronique dit qu elle attend sa premiere page`() = runTest {
        val source = MutableSharedFlow<CacheResult<ApiEngagementProgress>>(replay = 1)
        val vm = viewModel(source)
        source.emit(CacheResult.Empty)
        vm.state.first { it.phase == GameNotebookPhase.Loading }

        syncErrors.last().invoke(IOException("hors ligne"))

        val state = vm.state.first { it.phase == GameNotebookPhase.Ready }
        assertThat(state.isEmpty).isTrue()
    }

    @Test
    fun `un cache perime sans bloc de jeu se peint vide sans squelette`() = runTest {
        val vm = viewModel(flowOf(CacheResult.Stale(ApiEngagementProgress.empty, ageMillis = 1)))

        val state = vm.state.first { it.phase == GameNotebookPhase.Ready }

        assertThat(state.isEmpty).isTrue()
    }

    @Test
    fun `une situation connue rend les etapes a rattraper dans l ordre de leurs pistes`() {
        val state = GameNotebookUiState.ready(PhotoCatchUpStanding(rank = GloryRank.Murmure, division = 4, minted = 12))

        assertThat(state.catchUp.map { it.id }).containsExactly("start", "rank:murmure:4", "meesh:1", "meesh:10").inOrder()
        assertThat(state.catchUp.filter { it.isOpen }.map { it.id }).containsExactly("start", "rank:murmure:4", "meesh:1")
        assertThat(state.catchUp.last().blockedBy).isEqualTo("meesh:1")
        assertThat(state.isEmpty).isFalse()
    }
}
