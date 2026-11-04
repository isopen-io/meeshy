package me.meeshy.app.feed

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.SocketStatusCreatedData
import me.meeshy.sdk.model.SocketStatusDeletedData
import me.meeshy.sdk.model.SocketStatusReactedData
import me.meeshy.sdk.model.SocketStatusUnreactedData
import me.meeshy.sdk.model.SocketStatusUpdatedData
import me.meeshy.sdk.model.StatusComposerDraftSnapshot
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
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

@OptIn(ExperimentalCoroutinesApi::class)
class StatusesViewModelOfflineTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val repository: StatusRepository = mockk(relaxed = true)
    private val postRepository: PostRepository = mockk(relaxed = true)
    private val engagement: me.meeshy.sdk.post.FeedEngagementRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val diskCache: StatusBarCacheRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val statusCreatedFlow = MutableSharedFlow<SocketStatusCreatedData>(extraBufferCapacity = 8)
    private val statusUpdatedFlow = MutableSharedFlow<SocketStatusUpdatedData>(extraBufferCapacity = 8)
    private val statusDeletedFlow = MutableSharedFlow<SocketStatusDeletedData>(extraBufferCapacity = 8)
    private val statusReactedFlow = MutableSharedFlow<SocketStatusReactedData>(extraBufferCapacity = 8)
    private val statusUnreactedFlow = MutableSharedFlow<SocketStatusUnreactedData>(extraBufferCapacity = 8)

    private class FakeClock(var now: Long = 0L) : CacheClock {
        override fun nowMillis(): Long = now
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        coEvery { diskCache.cachedBar(any()) } returns null
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun entry(id: String, userId: String = "u-$id", emoji: String = "😀") =
        StatusEntry(id = id, userId = userId, moodEmoji = emoji)

    private fun apiStatus(id: String, userId: String, emoji: String = "😀") =
        ApiPost(id = id, type = "STATUS", moodEmoji = emoji, author = ApiAuthor(id = userId, username = "user-$userId"))

    private fun page(vararg entries: StatusEntry) =
        NetworkResult.Success(StatusPage(entries.toList(), nextCursor = null, hasMore = false))

    private fun viewModel(currentUser: MeeshyUser? = null, clock: CacheClock = FakeClock()): StatusesViewModel {
        every { session.currentUser } returns MutableStateFlow(currentUser)
        every { socialSocket.statusCreated } returns statusCreatedFlow
        every { socialSocket.statusUpdated } returns statusUpdatedFlow
        every { socialSocket.statusDeleted } returns statusDeletedFlow
        every { socialSocket.statusReacted } returns statusReactedFlow
        every { socialSocket.statusUnreacted } returns statusUnreactedFlow
        return StatusesViewModel(
            repository, postRepository, session, StatusBarCache(FakeClock()), diskCache, socialSocket, clock,
            InMemoryPrivacyPreferencesStore(PrivacyPreferences(allowAnalytics = true)), engagement,
        )
    }

    @Test
    fun `a mood typed offline is queued and announced with a toast, not as an error`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns page(entry("a"))
        coEvery { repository.create(any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Failure(ApiError("Mood queued", code = StatusRepository.QUEUED_OFFLINE))

        val vm = viewModel()
        vm.moodQueued.test {
            vm.setStatus(emoji = "🔥", content = "hello")
            awaitItem()
            expectNoEvents()
        }
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.statuses.map { it.id }).containsExactly("a")
    }

    @Test
    fun `a refused mood is an error and never a queued toast`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns page(entry("a"))
        coEvery { repository.create(any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Failure(ApiError("nope", code = "FORBIDDEN", httpStatus = 403))

        val vm = viewModel()
        vm.moodQueued.test {
            vm.setStatus(emoji = "🔥")
            expectNoEvents()
        }
        assertThat(vm.state.value.errorMessage).isEqualTo("nope")
    }

    @Test
    fun `the named audience and the mentions reach the repository`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns page(entry("a"))
        val vm = viewModel()
        val mention = me.meeshy.sdk.model.PostMentionInput(userId = "u9", username = "bob")

        vm.setStatus(emoji = "🔥", visibility = "ONLY", visibilityUserIds = listOf("u1"), mentions = listOf(mention))

        coVerify { repository.create("🔥", null, "ONLY", null, null, null, listOf("u1"), listOf(mention)) }
    }

    @Test
    fun `a mood stuck in the queue comes back as the composer draft`() = runTest {
        val clock = FakeClock(now = 99_000L)
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns page(entry("a"))
        coEvery { repository.recoverStuckMood(99_000L) } returns
            StatusComposerDraftSnapshot(emoji = "🔥", text = "hello", visibility = "FRIENDS")

        val draft = viewModel(clock = clock).recoverStuckMood()

        assertThat(draft?.selectedEmoji).isEqualTo("🔥")
        assertThat(draft?.text).isEqualTo("hello")
        assertThat(draft?.visibility).isEqualTo(StatusVisibility.FRIENDS)
    }

    @Test
    fun `anchoring without a comment is a simple repost to a permanent post`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns page(entry("a"))
        coEvery { postRepository.repost("src", PostType.POST, null, false, any()) } returns
            NetworkResult.Success(ApiPost(id = "p1"))

        assertThat(viewModel().anchorAsPost("src", comment = "  ")).isTrue()

        coVerify { postRepository.repost("src", PostType.POST, null, false, any()) }
    }

    @Test
    fun `anchoring with a comment quotes the mood and a refusal keeps the draft`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns page(entry("a"))
        coEvery { postRepository.repost("src", PostType.POST, "Pareil", true, any()) } returns
            NetworkResult.Failure(ApiError("offline"))

        assertThat(viewModel().anchorAsPost("src", comment = " Pareil ")).isFalse()

        coVerify { postRepository.repost("src", PostType.POST, "Pareil", true, any()) }
    }
}
