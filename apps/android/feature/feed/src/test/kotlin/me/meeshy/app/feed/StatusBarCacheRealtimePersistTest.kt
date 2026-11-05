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
class StatusBarCacheRealtimePersistTest {

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

    private suspend fun persisted(block: suspend () -> Unit) {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns page(entry("a"), entry("b"))
        block()
    }

    @Test
    fun `a created status is written through to the disk cache`() = runTest {
        persisted {
            viewModel()
            statusCreatedFlow.emit(SocketStatusCreatedData(status = apiStatus("n", "friend")))
        }
        coVerify { diskCache.persistBar(StatusFeedMode.FRIENDS, match { list -> list.first().id == "n" }, any()) }
    }

    @Test
    fun `a deleted status is written through to the disk cache`() = runTest {
        persisted {
            viewModel()
            statusDeletedFlow.emit(SocketStatusDeletedData(statusId = "a", authorId = "u-a"))
        }
        coVerify { diskCache.persistBar(StatusFeedMode.FRIENDS, match { list -> list.map { it.id } == listOf("b") }, any()) }
    }

    @Test
    fun `a reaction of another user is written through to the disk cache`() = runTest {
        persisted {
            viewModel(currentUser = MeeshyUser(id = "me", username = "me"))
            statusReactedFlow.emit(SocketStatusReactedData(statusId = "a", userId = "other", emoji = "❤️"))
        }
        coVerify {
            diskCache.persistBar(
                StatusFeedMode.FRIENDS,
                match { list -> list.first { it.id == "a" }.reactionSummary == mapOf("❤️" to 1) },
                any(),
            )
        }
    }

    @Test
    fun `the echo of my own reaction changes nothing and writes nothing`() = runTest {
        persisted {
            viewModel(currentUser = MeeshyUser(id = "me", username = "me"))
            statusReactedFlow.emit(SocketStatusReactedData(statusId = "a", userId = "me", emoji = "❤️"))
        }
        coVerify(exactly = 1) { diskCache.persistBar(any(), any(), any()) }
    }
}
