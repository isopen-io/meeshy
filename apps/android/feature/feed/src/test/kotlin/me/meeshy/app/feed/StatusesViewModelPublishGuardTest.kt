package me.meeshy.app.feed

import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.FeedEngagementRepository
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusBarCacheRepository
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.status.StatusPage
import me.meeshy.sdk.status.StatusRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Un double toucher sur Publier ne publie qu'une humeur (#18271, constat android-fil-02#5). */
@OptIn(ExperimentalCoroutinesApi::class)
class StatusesViewModelPublishGuardTest {

    private val repository: StatusRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val diskCache: StatusBarCacheRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)

    private object FixedClock : CacheClock {
        override fun nowMillis(): Long = 0L
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        coEvery { diskCache.cachedBar(any()) } returns null
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            NetworkResult.Success(StatusPage(emptyList(), nextCursor = null, hasMore = false))
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel(): StatusesViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me-id", username = "me"))
        every { socialSocket.statusCreated } returns MutableSharedFlow()
        every { socialSocket.statusUpdated } returns MutableSharedFlow()
        every { socialSocket.statusDeleted } returns MutableSharedFlow()
        every { socialSocket.statusReacted } returns MutableSharedFlow()
        every { socialSocket.statusUnreacted } returns MutableSharedFlow()
        return StatusesViewModel(
            repository, mockk<PostRepository>(relaxed = true), session, StatusBarCache(FixedClock), diskCache, socialSocket,
            FixedClock, InMemoryPrivacyPreferencesStore(PrivacyPreferences(allowAnalytics = true)),
            mockk<FeedEngagementRepository>(relaxed = true),
        )
    }

    @Test
    fun `a second Publish while the first mood is still leaving publishes nothing more`() = runTest {
        val gate = CompletableDeferred<NetworkResult<StatusEntry>>()
        coEvery { repository.create(any(), any(), any(), any(), any(), any()) } coAnswers { gate.await() }

        val vm = viewModel()
        vm.setStatus(emoji = "🔥", content = "hello")
        vm.setStatus(emoji = "🔥", content = "hello")
        gate.complete(NetworkResult.Success(StatusEntry(id = "new", userId = "me-id", moodEmoji = "🔥")))

        coVerify(exactly = 1) { repository.create(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `another mood published while the first is still leaving is not lost`() = runTest {
        val gate = CompletableDeferred<NetworkResult<StatusEntry>>()
        coEvery { repository.create(any(), any(), any(), any(), any(), any()) } coAnswers { gate.await() }

        val vm = viewModel()
        vm.setStatus(emoji = "🔥", content = "hello")
        vm.setStatus(emoji = "🎉", content = "encore")
        gate.complete(NetworkResult.Success(StatusEntry(id = "new", userId = "me-id", moodEmoji = "🔥")))

        coVerify(exactly = 1) { repository.create("🔥", "hello", any(), any(), any(), any()) }
        coVerify(exactly = 1) { repository.create("🎉", "encore", any(), any(), any(), any()) }
    }

    @Test
    fun `the same mood published again once the first has left publishes again`() = runTest {
        coEvery { repository.create(any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Success(StatusEntry(id = "new", userId = "me-id", moodEmoji = "🔥"))

        val vm = viewModel()
        vm.setStatus(emoji = "🔥", content = "hello")
        vm.setStatus(emoji = "🔥", content = "hello")

        coVerify(exactly = 2) { repository.create("🔥", "hello", any(), any(), any(), any()) }
    }

    @Test
    fun `once the first mood has left, a new one publishes`() = runTest {
        coEvery { repository.create(any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Success(StatusEntry(id = "new", userId = "me-id", moodEmoji = "🔥"))

        val vm = viewModel()
        vm.setStatus(emoji = "🔥")
        vm.setStatus(emoji = "🎉")

        coVerify(exactly = 2) { repository.create(any(), any(), any(), any(), any(), any()) }
    }
}
