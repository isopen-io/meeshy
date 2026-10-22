package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MyStoriesTab
import me.meeshy.sdk.model.MyStoryDeleteConfirmation
import me.meeshy.sdk.model.SocketStoryDeletedData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryPublishQueue
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class MyStoriesViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val nowMillis = Instant.parse("2026-10-22T12:00:00Z").toEpochMilli()
    private val deletedFlow = MutableSharedFlow<SocketStoryDeletedData>(extraBufferCapacity = 8)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun post(id: String, createdAt: String, expiresAt: String?, views: Int = 0) = ApiPost(
        id = id,
        type = "STORY",
        createdAt = createdAt,
        expiresAt = expiresAt,
        viewCount = views,
        author = ApiAuthor(id = "me", username = "me"),
    )

    private val activeA = post("a", "2026-10-22T10:00:00Z", "2026-10-23T10:00:00Z", views = 4)
    private val activeB = post("b", "2026-10-22T09:00:00Z", "2026-10-23T09:00:00Z")
    private val expired = post("old", "2026-10-01T09:00:00Z", "2026-10-02T09:00:00Z")

    private fun failure() = NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_500"))

    private fun repository(
        stream: List<ApiPost> = listOf(activeA, activeB),
        drained: NetworkResult<List<ApiPost>> = NetworkResult.Success(listOf(activeA, activeB, expired)),
        cached: List<ApiPost>? = null,
    ): StoryRepository = mockk<StoryRepository>(relaxed = true).also {
        every { it.storiesStream(any(), any()) } returns flowOf(CacheResult.Fresh(stream, 0L))
        every { it.publishQueue() } returns flowOf(StoryPublishQueue(emptyList(), emptyList()))
        coEvery { it.cachedMyStories() } returns cached
        coEvery { it.drainMyStories(any(), any()) } returns drained
        coEvery { it.delete(any()) } returns NetworkResult.Success(Unit)
    }

    private fun viewModel(repo: StoryRepository): MyStoriesViewModel {
        val session = mockk<SessionRepository>(relaxed = true).also { every { it.currentUserId } returns "me" }
        val socket = mockk<SocialSocketManager>(relaxed = true).also { every { it.storyDeleted } returns deletedFlow }
        return MyStoriesViewModel(repo, session, socket) { nowMillis }
    }

    @Test
    fun `les stories actives et expirees se classent d'elles-memes et l'archive ouvre un onglet`() = runTest(dispatcher) {
        val vm = viewModel(repository())
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.active.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(state.archived.map { it.id }).containsExactly("old")
        assertThat(state.visibleTabs).contains(MyStoriesTab.ARCHIVE)
        assertThat(state.tab).isEqualTo(MyStoriesTab.PUBLISHED)
        assertThat(state.active.first().viewCount).isEqualTo(4)
        assertThat(state.showSkeleton).isFalse()
    }

    @Test
    fun `sans story active ni travail l'onglet d'ouverture est Brouillons seulement s'il y a des brouillons`() = runTest(dispatcher) {
        val vm = viewModel(repository(stream = emptyList(), drained = NetworkResult.Success(listOf(expired))))
        advanceUntilIdle()

        assertThat(vm.state.value.tab).isEqualTo(MyStoriesTab.PUBLISHED)
        assertThat(vm.state.value.archived.map { it.id }).containsExactly("old")
    }

    @Test
    fun `l'archive en cache peint tout de suite et une panne reseau la garde`() = runTest(dispatcher) {
        val vm = viewModel(
            repository(stream = emptyList(), drained = failure(), cached = listOf(expired)),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.archived.map { it.id }).containsExactly("old")
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun `la selection est filtree contre les stories affichees`() = runTest(dispatcher) {
        val vm = viewModel(repository())
        advanceUntilIdle()
        vm.onEvent(MyStoriesUiEvent.ToggleSelecting)
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("a"))
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("b"))
        assertThat(vm.state.value.selectedIds).containsExactly("a", "b")

        deletedFlow.tryEmit(SocketStoryDeletedData(storyId = "b"))
        advanceUntilIdle()

        assertThat(vm.state.value.selectedIds).containsExactly("a")
    }

    @Test
    fun `quitter le mode selection vide la selection`() = runTest(dispatcher) {
        val vm = viewModel(repository())
        advanceUntilIdle()
        vm.onEvent(MyStoriesUiEvent.ToggleSelecting)
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("a"))
        vm.onEvent(MyStoriesUiEvent.ToggleSelecting)

        assertThat(vm.state.value.isSelecting).isFalse()
        assertThat(vm.state.value.selectedIds).isEmpty()
    }

    @Test
    fun `supprimer une story demande confirmation puis la retire`() = runTest(dispatcher) {
        val repo = repository()
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestDelete("a"))
        assertThat(vm.state.value.pendingDelete?.target).isEqualTo(MyStoryDeleteConfirmation.Target.PUBLISHED_STORY)
        coVerify(exactly = 0) { repo.delete(any()) }

        vm.onEvent(MyStoriesUiEvent.ConfirmDelete)
        advanceUntilIdle()

        coVerify { repo.delete("a") }
        assertThat(vm.state.value.active.map { it.id }).containsExactly("b")
        assertThat(vm.state.value.pendingDelete).isNull()
    }

    @Test
    fun `une suppression refusee par le serveur remet la story en place`() = runTest(dispatcher) {
        val repo = repository()
        coEvery { repo.delete("a") } returns failure()
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestDelete("a"))
        vm.onEvent(MyStoriesUiEvent.ConfirmDelete)
        advanceUntilIdle()

        assertThat(vm.state.value.active.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `annuler la confirmation ne supprime rien`() = runTest(dispatcher) {
        val repo = repository()
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.RequestDelete("a"))
        vm.onEvent(MyStoriesUiEvent.DismissDelete)
        vm.onEvent(MyStoriesUiEvent.ConfirmDelete)
        advanceUntilIdle()

        coVerify(exactly = 0) { repo.delete(any()) }
        assertThat(vm.state.value.active).hasSize(2)
    }

    @Test
    fun `la suppression en masse a une alerte dediee et retire le lot`() = runTest(dispatcher) {
        val repo = repository()
        val vm = viewModel(repo)
        advanceUntilIdle()
        vm.onEvent(MyStoriesUiEvent.ToggleSelecting)
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("a"))
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("old"))

        vm.onEvent(MyStoriesUiEvent.RequestBulkDelete)
        assertThat(vm.state.value.pendingDelete?.target).isEqualTo(MyStoryDeleteConfirmation.Target.BULK_SELECTION)
        vm.onEvent(MyStoriesUiEvent.ConfirmDelete)
        advanceUntilIdle()

        coVerify { repo.delete("a") }
        coVerify { repo.delete("old") }
        assertThat(vm.state.value.active.map { it.id }).containsExactly("b")
        assertThat(vm.state.value.archived).isEmpty()
        assertThat(vm.state.value.selectedIds).isEmpty()
        assertThat(vm.state.value.isSelecting).isFalse()
        assertThat(vm.state.value.tab).isEqualTo(MyStoriesTab.PUBLISHED)
    }

    @Test
    fun `en masse un echec laisse la story selectionnee en place et le compte est remonte`() = runTest(dispatcher) {
        val repo = repository()
        coEvery { repo.delete("b") } returns failure()
        val vm = viewModel(repo)
        advanceUntilIdle()
        vm.onEvent(MyStoriesUiEvent.ToggleSelecting)
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("a"))
        vm.onEvent(MyStoriesUiEvent.ToggleSelected("b"))
        vm.onEvent(MyStoriesUiEvent.RequestBulkDelete)
        vm.onEvent(MyStoriesUiEvent.ConfirmDelete)
        advanceUntilIdle()

        assertThat(vm.state.value.active.map { it.id }).containsExactly("b")
    }

    @Test
    fun `republier remplace la story par la version republiee`() = runTest(dispatcher) {
        val repo = repository()
        val republished = activeA.copy(createdAt = "2026-10-22T11:59:00Z", viewCount = 0)
        coEvery { repo.republish("a") } returns NetworkResult.Success(republished)
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.onEvent(MyStoriesUiEvent.Republish("a"))
        advanceUntilIdle()

        assertThat(vm.state.value.active.first().id).isEqualTo("a")
        assertThat(vm.state.value.active.first().viewCount).isEqualTo(0)
        assertThat(vm.state.value.isRepublishing).isFalse()
    }
}
