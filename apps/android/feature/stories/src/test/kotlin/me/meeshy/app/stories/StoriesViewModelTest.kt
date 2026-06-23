package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoriesViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // A freshly-created story: live for the 21h fallback window, so the tray
    // builder (which drops fully-expired groups against the wall clock) keeps it.
    private fun story(id: String, authorId: String, name: String) =
        ApiPost(
            id = id,
            type = "STORY",
            createdAt = java.time.Instant.now().toString(),
            author = ApiAuthor(id = authorId, username = name),
        )

    private fun session(userId: String? = "me"): SessionRepository =
        mockk<SessionRepository> { every { currentUserId } returns userId }

    private fun repositoryReturning(stream: Flow<CacheResult<List<ApiPost>>>): StoryRepository =
        mockk<StoryRepository>(relaxed = true).also {
            every { it.storiesStream(any(), any()) } returns stream
        }

    private fun viewModel(repo: StoryRepository, session: SessionRepository = session()) =
        StoriesViewModel(repo, session, MeeshyConfig())

    @Test
    fun `cold empty cache shows the skeleton with no tray`() = runTest(dispatcher) {
        val vm = viewModel(repositoryReturning(flowOf(CacheResult.Empty)))
        advanceUntilIdle()

        assertThat(vm.state.value.showSkeleton).isTrue()
        assertThat(vm.state.value.isSyncing).isFalse()
        assertThat(vm.state.value.tray.isEmpty).isTrue()
    }

    @Test
    fun `fresh cache builds the tray and clears the skeleton`() = runTest(dispatcher) {
        val vm = viewModel(
            repositoryReturning(
                flowOf(CacheResult.Fresh(listOf(story("s1", "u1", "alice")), ageMillis = 0)),
            ),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.showSkeleton).isFalse()
        assertThat(vm.state.value.isSyncing).isFalse()
        assertThat(vm.state.value.tray.others.map { it.userId }).containsExactly("u1")
    }

    @Test
    fun `the current user's story lands in the self ring`() = runTest(dispatcher) {
        val vm = viewModel(
            repositoryReturning(
                flowOf(CacheResult.Fresh(listOf(story("s1", "me", "self")), ageMillis = 0)),
            ),
            session = session(userId = "me"),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.tray.self?.userId).isEqualTo("me")
        assertThat(vm.state.value.tray.others).isEmpty()
    }

    @Test
    fun `stale cache keeps the tray painted and marks syncing`() = runTest(dispatcher) {
        val vm = viewModel(
            repositoryReturning(
                flowOf(CacheResult.Stale(listOf(story("s1", "u1", "alice")), ageMillis = 0)),
            ),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.tray.others).hasSize(1)
        assertThat(vm.state.value.isSyncing).isTrue()
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun `syncing with no cached data shows the skeleton`() = runTest(dispatcher) {
        val vm = viewModel(repositoryReturning(flowOf(CacheResult.Syncing(null))))
        advanceUntilIdle()

        assertThat(vm.state.value.showSkeleton).isTrue()
        assertThat(vm.state.value.isSyncing).isTrue()
    }

    @Test
    fun `a background sync failure clears the cold skeleton`() = runTest(dispatcher) {
        val repo = mockk<StoryRepository>(relaxed = true)
        val onError = slot<(Throwable) -> Unit>()
        every { repo.storiesStream(any(), capture(onError)) } returns flowOf(CacheResult.Empty)
        val vm = viewModel(repo)
        advanceUntilIdle()
        assertThat(vm.state.value.showSkeleton).isTrue()

        onError.captured.invoke(RuntimeException("offline"))

        assertThat(vm.state.value.showSkeleton).isFalse()
        assertThat(vm.state.value.isSyncing).isFalse()
    }
}
