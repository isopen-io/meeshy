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
import me.meeshy.app.game.photo.FakePhotoNotebook
import me.meeshy.app.game.photo.KeptPhoto
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.PhotoCatchUpStanding
import me.meeshy.sdk.model.game.PhotoStepEmblem
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.PhotoMode
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

    private fun viewModel(
        source: Flow<CacheResult<ApiEngagementProgress>>,
        notebook: FakePhotoNotebook = FakePhotoNotebook(),
    ): GameNotebookViewModel {
        val repository = mockk<EngagementProgressRepository>()
        every { repository.progress(any()) } answers {
            syncErrors += firstArg<(Throwable) -> Unit>()
            source
        }
        return GameNotebookViewModel(repository, notebook, testDispatcher, thumbnail = { null })
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

    @Test
    fun `une photo gardee quitte le rattrapage et rejoint les photos gardees`() {
        val notebook = FakePhotoNotebook()
        kotlinx.coroutines.runBlocking { notebook.keep(GamePhotoMoment("start", PhotoStepEmblem.Start), KeptPhoto(byteArrayOf(1), PhotoMode.Card)) }
        val shelf = NotebookShelf(kotlinx.coroutines.runBlocking { notebook.list() })

        val state = GameNotebookUiState.ready(PhotoCatchUpStanding(rank = GloryRank.Murmure, division = 4, minted = 0), shelf)

        assertThat(state.kept.map { it.momentId }).containsExactly("start")
        assertThat(state.catchUp.map { it.id }).doesNotContain("start")
    }

    @Test
    fun `la chronique lit le carnet de l appareil et retire une photo`() = runTest {
        val notebook = FakePhotoNotebook()
        notebook.keep(GamePhotoMoment("trophy:spring", PhotoStepEmblem.Start), KeptPhoto(byteArrayOf(1), PhotoMode.Card))
        notebook.postpone(GamePhotoMoment("league:gold", PhotoStepEmblem.Start))
        val vm = viewModel(flowOf(CacheResult.Stale(ApiEngagementProgress.empty, ageMillis = 1)), notebook)

        val read = vm.state.first { it.kept.isNotEmpty() }
        assertThat(read.pending.map { it.momentId }).containsExactly("league:gold")
        assertThat(read.shelf.occupiedBytes).isEqualTo(2_048L)

        vm.remove(read.kept.single())

        val after = vm.state.first { it.kept.isEmpty() }
        assertThat(after.shelf.removalFailed).isFalse()
        assertThat(after.pending).hasSize(1)
    }

    @Test
    fun `un retrait refuse se dit sans rien perdre`() = runTest {
        val notebook = FakePhotoNotebook(removeSucceeds = false)
        notebook.keep(GamePhotoMoment("trophy:spring", PhotoStepEmblem.Start), KeptPhoto(byteArrayOf(1), PhotoMode.Card))
        val vm = viewModel(flowOf(CacheResult.Stale(ApiEngagementProgress.empty, ageMillis = 1)), notebook)
        val read = vm.state.first { it.kept.isNotEmpty() }

        vm.remove(read.kept.single())

        val after = vm.state.first { it.shelf.removalFailed }
        assertThat(after.kept).hasSize(1)
    }
}
