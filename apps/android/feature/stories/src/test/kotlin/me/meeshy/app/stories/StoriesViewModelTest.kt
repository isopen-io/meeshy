package me.meeshy.app.stories

import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.FailedStoryPublish
import me.meeshy.sdk.story.PendingStoryPublish
import me.meeshy.sdk.story.StoryPublishQueue
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

    // A freshly-enqueued publish: stamped now so its synthetic story stays live.
    private fun pendingPublish(tempId: String, content: String) =
        PendingStoryPublish(
            tempId = tempId,
            content = content,
            visibility = "PUBLIC",
            originalLanguage = "fr",
            createdAtMillis = System.currentTimeMillis(),
        )

    private fun failedPublish(cmid: String, tempId: String, content: String = "oops") =
        FailedStoryPublish(
            cmid = cmid,
            tempId = tempId,
            content = content,
            visibility = "PUBLIC",
            originalLanguage = "fr",
            createdAtMillis = System.currentTimeMillis(),
            failedAtMillis = System.currentTimeMillis(),
        )

    private fun session(userId: String? = "me"): SessionRepository {
        val user = userId?.let { MeeshyUser(id = it, username = "self") }
        return mockk<SessionRepository>(relaxed = true).also {
            every { it.currentUser } returns MutableStateFlow(user)
            every { it.currentUserId } returns userId
        }
    }

    private val workManager: WorkManager = mockk(relaxed = true)

    private fun queueOf(
        pending: List<PendingStoryPublish> = emptyList(),
        failed: List<FailedStoryPublish> = emptyList(),
    ) = StoryPublishQueue(pending = pending, failed = failed)

    private fun repositoryReturning(
        stream: Flow<CacheResult<List<ApiPost>>>,
        queue: Flow<StoryPublishQueue> = flowOf(queueOf()),
    ): StoryRepository =
        mockk<StoryRepository>(relaxed = true).also {
            every { it.storiesStream(any(), any()) } returns stream
            every { it.publishQueue() } returns queue
        }

    private fun viewModel(repo: StoryRepository, session: SessionRepository = session()) =
        StoriesViewModel(repo, session, MeeshyConfig(), workManager)

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
        every { repo.publishQueue() } returns flowOf(queueOf())
        val vm = viewModel(repo)
        advanceUntilIdle()
        assertThat(vm.state.value.showSkeleton).isTrue()

        onError.captured.invoke(RuntimeException("offline"))

        assertThat(vm.state.value.showSkeleton).isFalse()
        assertThat(vm.state.value.isSyncing).isFalse()
    }

    @Test
    fun `a queued publish injects an optimistic self ring`() = runTest(dispatcher) {
        val vm = viewModel(
            repositoryReturning(
                stream = flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0)),
                queue = flowOf(queueOf(pending = listOf(pendingPublish("pending_1", "hello")))),
            ),
            session = session(userId = "me"),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.tray.self?.userId).isEqualTo("me")
        assertThat(vm.state.value.tray.self?.storyCount).isEqualTo(1)
        assertThat(vm.state.value.tray.others).isEmpty()
    }

    @Test
    fun `a queued publish merges with the user's server stories into one self ring`() =
        runTest(dispatcher) {
            val vm = viewModel(
                repositoryReturning(
                    stream = flowOf(CacheResult.Fresh(listOf(story("s1", "me", "self")), ageMillis = 0)),
                    queue = flowOf(queueOf(pending = listOf(pendingPublish("pending_1", "hello")))),
                ),
                session = session(userId = "me"),
            )
            advanceUntilIdle()

            assertThat(vm.state.value.tray.self?.userId).isEqualTo("me")
            assertThat(vm.state.value.tray.self?.storyCount).isEqualTo(2)
        }

    @Test
    fun `a logged-out tray shows nothing optimistic for a pending publish`() = runTest(dispatcher) {
        val vm = viewModel(
            repositoryReturning(
                stream = flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0)),
                queue = flowOf(queueOf(pending = listOf(pendingPublish("pending_1", "hello")))),
            ),
            session = session(userId = null),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.tray.isEmpty).isTrue()
    }

    @Test
    fun `a publish that vanishes from the queue refreshes to hand off to the real story`() =
        runTest(dispatcher) {
            val repo = mockk<StoryRepository>(relaxed = true)
            every { repo.storiesStream(any(), any()) } returns
                flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0))
            every { repo.publishQueue() } returns flowOf(
                queueOf(pending = listOf(pendingPublish("pending_1", "hello"))),
                queueOf(),
            )
            val vm = StoriesViewModel(repo, session(userId = "me"), MeeshyConfig(), workManager)
            advanceUntilIdle()

            assertThat(vm.state.value.tray.isEmpty).isTrue()
            coVerify(exactly = 1) { repo.refresh() }
        }

    @Test
    fun `a still-pending publish does not trigger a refresh`() = runTest(dispatcher) {
        val repo = mockk<StoryRepository>(relaxed = true)
        every { repo.storiesStream(any(), any()) } returns
            flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0))
        every { repo.publishQueue() } returns
            flowOf(queueOf(pending = listOf(pendingPublish("pending_1", "hello"))))
        val vm = StoriesViewModel(repo, session(userId = "me"), MeeshyConfig(), workManager)
        advanceUntilIdle()

        assertThat(vm.state.value.tray.self?.storyCount).isEqualTo(1)
        coVerify(exactly = 0) { repo.refresh() }
    }

    @Test
    fun `an exhausted publish surfaces as a failed item with no spurious refresh`() =
        runTest(dispatcher) {
            val repo = mockk<StoryRepository>(relaxed = true)
            every { repo.storiesStream(any(), any()) } returns
                flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0))
            // One atomic transition: the publish leaves `pending` and enters `failed`
            // in the SAME snapshot — so it is never seen in neither set (no false delivery).
            every { repo.publishQueue() } returns flowOf(
                queueOf(pending = listOf(pendingPublish("pending_1", "hello"))),
                queueOf(failed = listOf(failedPublish("c1", "pending_1", "hello"))),
            )
            val vm = StoriesViewModel(repo, session(userId = "me"), MeeshyConfig(), workManager)
            advanceUntilIdle()

            assertThat(vm.state.value.failedPublishes.map { it.cmid }).containsExactly("c1")
            assertThat(vm.state.value.tray.isEmpty).isTrue()
            // A failed publish is NOT a delivery: it must not provoke a hand-off refresh.
            coVerify(exactly = 0) { repo.refresh() }
        }

    @Test
    fun `retryPublish revives the row and kicks the drain worker`() = runTest(dispatcher) {
        val repo = repositoryReturning(
            stream = flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0)),
            queue = flowOf(queueOf(failed = listOf(failedPublish("c1", "pending_1")))),
        )
        coEvery { repo.retryPublish("c1") } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.retryPublish("c1")
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.retryPublish("c1") }
        coVerify(exactly = 1) { workManager.enqueue(any<OneTimeWorkRequest>()) }
    }

    @Test
    fun `retryPublish on a vanished row does not kick the worker`() = runTest(dispatcher) {
        val repo = repositoryReturning(stream = flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0)))
        coEvery { repo.retryPublish("gone") } returns false
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.retryPublish("gone")
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.retryPublish("gone") }
        coVerify(exactly = 0) { workManager.enqueue(any<OneTimeWorkRequest>()) }
    }

    @Test
    fun `discardPublish drops the failed row`() = runTest(dispatcher) {
        val repo = repositoryReturning(
            stream = flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0)),
            queue = flowOf(queueOf(failed = listOf(failedPublish("c1", "pending_1")))),
        )
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.discardPublish("c1")
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.discardPublish("c1") }
    }
}
