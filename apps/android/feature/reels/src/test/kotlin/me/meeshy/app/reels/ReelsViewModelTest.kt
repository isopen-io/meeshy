package me.meeshy.app.reels

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import io.mockk.verifyOrder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import io.mockk.coVerify
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.SocketPostBookmarkedData
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.model.SocketPostUnlikedData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * The reel viewer's slice of the post realtime room: the visible reel owns the subscription,
 * and a live `post:liked`/`post:unliked` resyncs that reel's counter to the server-authoritative
 * value. Mirrors `PostDetailViewModelTest`'s realtime-room coverage.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ReelsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val postLiked = MutableSharedFlow<SocketPostLikedData>(extraBufferCapacity = 64)
    private val postUnliked = MutableSharedFlow<SocketPostUnlikedData>(extraBufferCapacity = 64)
    private val postBookmarked = MutableSharedFlow<SocketPostBookmarkedData>(extraBufferCapacity = 64)
    private val config = MeeshyConfig()
    private var clockNow: Long = 0L
    private val clock = object : CacheClock {
        override fun nowMillis(): Long = clockNow
    }

    private fun reel(
        id: String,
        likeCount: Int = 0,
        isLikedByMe: Boolean = false,
        isBookmarkedByMe: Boolean = false,
        bookmarkCount: Int = 0,
    ) = ApiPost(
        id = id,
        type = "REEL",
        likeCount = likeCount,
        isLikedByMe = isLikedByMe,
        isBookmarkedByMe = isBookmarkedByMe,
        bookmarkCount = bookmarkCount,
        media = listOf(
            ApiPostMedia(id = "m-$id", mimeType = "video/mp4", fileUrl = "https://cdn.test/$id.mp4"),
        ),
    )

    private fun viewModel(
        thread: List<ApiPost> = emptyList(),
        cachedFeed: List<ApiPost>? = null,
        nextCursor: String? = null,
        hasMore: Boolean = false,
        currentUserId: String? = "me",
        allowAnalytics: Boolean = true,
    ): ReelsViewModel {
        every { session.currentUserId } returns currentUserId
        every { socialSocket.postLiked } returns postLiked
        every { socialSocket.postUnliked } returns postUnliked
        every { socialSocket.postBookmarked } returns postBookmarked
        every { repository.feedCacheSnapshot } returns cachedFeed
        coEvery { repository.getReelsPage(any(), any(), any()) } returns
            NetworkResult.Success(PostPage(posts = thread, nextCursor = nextCursor, hasMore = hasMore))
        val privacyStore = InMemoryPrivacyPreferencesStore(
            PrivacyPreferences(allowAnalytics = allowAnalytics),
        )
        return ReelsViewModel(repository, session, socialSocket, config, clock, privacyStore)
    }

    // MARK: - Post room membership

    @Test
    fun `the settled reel joins its post room`() = runTest {
        val vm = viewModel()

        vm.setCurrentReel("r1")

        verify(exactly = 1) { socialSocket.joinPostRoom("r1") }
        verify(exactly = 0) { socialSocket.leavePostRoom(any()) }
    }

    @Test
    fun `paging to the next reel leaves the previous room before joining the new one`() = runTest {
        val vm = viewModel()

        vm.setCurrentReel("r1")
        vm.setCurrentReel("r2")

        verifyOrder {
            socialSocket.joinPostRoom("r1")
            socialSocket.leavePostRoom("r1")
            socialSocket.joinPostRoom("r2")
        }
        verify(exactly = 0) { socialSocket.leavePostRoom("r2") }
    }

    @Test
    fun `re-settling on the same reel does not re-join`() = runTest {
        val vm = viewModel()

        vm.setCurrentReel("r1")
        vm.setCurrentReel("r1")
        vm.setCurrentReel("r1")

        verify(exactly = 1) { socialSocket.joinPostRoom("r1") }
        verify(exactly = 0) { socialSocket.leavePostRoom(any()) }
    }

    @Test
    fun `a blank reel id never joins a room`() = runTest {
        val vm = viewModel()

        vm.setCurrentReel("")
        vm.setCurrentReel(null)

        verify(exactly = 0) { socialSocket.joinPostRoom(any()) }
    }

    @Test
    fun `an empty page index leaves the current room without joining another`() = runTest {
        val vm = viewModel()

        vm.setCurrentReel("r1")
        vm.setCurrentReel(null)

        verify(exactly = 1) { socialSocket.joinPostRoom("r1") }
        verify(exactly = 1) { socialSocket.leavePostRoom("r1") }
    }

    // MARK: - Dwell-aware view recording

    @Test
    fun `a reel dwelt past the floor records its view with the measured duration when the pager moves on`() = runTest {
        val vm = viewModel()

        clockNow = 0
        vm.setCurrentReel("r1")
        clockNow = 1000
        vm.setCurrentReel("r2")

        coVerify(exactly = 1) { repository.viewPost("r1", 1000) }
    }

    @Test
    fun `a reel bounced under the dwell floor records no view`() = runTest {
        val vm = viewModel()

        clockNow = 0
        vm.setCurrentReel("r1")
        clockNow = 999
        vm.setCurrentReel("r2")

        coVerify(exactly = 0) { repository.viewPost("r1", any()) }
    }

    @Test
    fun `leaving the reels thread records the final reel's dwell`() = runTest {
        val vm = viewModel()

        clockNow = 0
        vm.setCurrentReel("r1")
        clockNow = 1500
        vm.setCurrentReel(null)

        coVerify(exactly = 1) { repository.viewPost("r1", 1500) }
    }

    @Test
    fun `re-settling the same reel keeps one session and records one view on leave`() = runTest {
        val vm = viewModel()

        clockNow = 0
        vm.setCurrentReel("r1")
        clockNow = 500
        vm.setCurrentReel("r1") // inert re-settle: no second session, no restart
        clockNow = 1000
        vm.setCurrentReel(null)

        coVerify(exactly = 1) { repository.viewPost("r1", 1000) }
    }

    // MARK: - Analytics-consent gate (mirror of iOS `EngagementTracker.begin` `guard consentProvider()`)

    @Test
    fun `with analytics consent withheld a qualifying reel dwell records no view`() = runTest {
        val vm = viewModel(allowAnalytics = false)

        clockNow = 0
        vm.setCurrentReel("r1")
        clockNow = 1000
        vm.setCurrentReel("r2") // a 1000ms dwell WOULD qualify — but consent was withheld

        // No session opened, so the dwell record (the only view the reels surface produces)
        // never fires. 1000 is the exact duration this scenario could have recorded.
        coVerify(exactly = 0) { repository.viewPost("r1", 1000) }
    }

    // MARK: - Live like state

    @Test
    fun `a live post-liked from the viewer resyncs the count and marks the heart`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1", likeCount = 3)))
        vm.load()

        vm.state.test {
            val initial = awaitItem()
            assertThat(initial.reels.single().likeCount).isEqualTo(3)
            assertThat(initial.reels.single().isLiked).isFalse()

            postLiked.tryEmit(SocketPostLikedData(postId = "r1", userId = "me", likesCount = 4))

            val updated = awaitItem()
            assertThat(updated.reels.single().likeCount).isEqualTo(4)
            assertThat(updated.reels.single().isLiked).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a live post-liked from someone else moves the count but never the heart`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1", likeCount = 3)))
        vm.load()

        vm.state.test {
            assertThat(awaitItem().reels.single().likeCount).isEqualTo(3)

            postLiked.tryEmit(SocketPostLikedData(postId = "r1", userId = "someone-else", likesCount = 4))

            val updated = awaitItem()
            assertThat(updated.reels.single().likeCount).isEqualTo(4)
            assertThat(updated.reels.single().isLiked).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a live post-unliked from the viewer resyncs the count and clears the heart`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1", likeCount = 4, isLikedByMe = true)))
        vm.load()

        vm.state.test {
            val initial = awaitItem()
            assertThat(initial.reels.single().isLiked).isTrue()

            postUnliked.tryEmit(SocketPostUnlikedData(postId = "r1", userId = "me", likesCount = 3))

            val updated = awaitItem()
            assertThat(updated.reels.single().likeCount).isEqualTo(3)
            assertThat(updated.reels.single().isLiked).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a live like heals the drift an optimistic toggle left behind`() = runTest {
        coEvery { repository.like("r1") } returns NetworkResult.Success(Unit)
        val vm = viewModel(thread = listOf(reel("r1", likeCount = 10)))
        vm.load()
        vm.toggleLike("r1")
        assertThat(vm.state.value.reels.single().likeCount).isEqualTo(11)

        // The gateway counted two other likes racing ours; its absolute count wins.
        postLiked.tryEmit(SocketPostLikedData(postId = "r1", userId = "me", likesCount = 13))

        assertThat(vm.state.value.reels.single().likeCount).isEqualTo(13)
        assertThat(vm.state.value.reels.single().isLiked).isTrue()
    }

    @Test
    fun `a live like for a reel outside the thread is inert`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1", likeCount = 3), reel("r2", likeCount = 7)))
        vm.load()

        postLiked.tryEmit(SocketPostLikedData(postId = "r-elsewhere", userId = "me", likesCount = 99))

        assertThat(vm.state.value.reels.map { it.likeCount }).containsExactly(3, 7).inOrder()
        assertThat(vm.state.value.reels.none { it.isLiked }).isTrue()
    }

    @Test
    fun `a live like only touches the reel it names`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1", likeCount = 3), reel("r2", likeCount = 7)))
        vm.load()

        postLiked.tryEmit(SocketPostLikedData(postId = "r2", userId = "someone-else", likesCount = 8))

        assertThat(vm.state.value.reels.map { it.likeCount }).containsExactly(3, 8).inOrder()
    }

    @Test
    fun `a negative absolute count is clamped rather than rendered`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1", likeCount = 1, isLikedByMe = true)))
        vm.load()

        postUnliked.tryEmit(SocketPostUnlikedData(postId = "r1", userId = "me", likesCount = -1))

        assertThat(vm.state.value.reels.single().likeCount).isEqualTo(0)
    }

    @Test
    fun `an anonymous viewer never has a like attributed to them`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1", likeCount = 3)), currentUserId = null)
        vm.load()

        postLiked.tryEmit(SocketPostLikedData(postId = "r1", userId = "someone-else", likesCount = 4))

        assertThat(vm.state.value.reels.single().likeCount).isEqualTo(4)
        assertThat(vm.state.value.reels.single().isLiked).isFalse()
    }

    // MARK: - Cache-first cold start (seeding from the Feed's already-loaded video posts)

    @Test
    fun `load seeds instantly from the feed's cached video posts, no spinner, then the network thread replaces it`() = runTest {
        val cached = listOf(reel("cached-1"), reel("cached-2"))
        val vm = viewModel(thread = listOf(reel("network-1")), cachedFeed = cached)

        vm.state.test {
            assertThat(awaitItem().reels).isEmpty() // initial default state

            vm.load()

            val seeded = awaitItem()
            assertThat(seeded.reels.map { it.id }).containsExactly("cached-1", "cached-2").inOrder()
            assertThat(seeded.isLoading).isFalse()

            val loaded = awaitItem()
            assertThat(loaded.reels.map { it.id }).containsExactly("network-1")
            assertThat(loaded.isLoading).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `load shows the loading state on a true cold start, with nothing cached to seed`() = runTest {
        val vm = viewModel(thread = listOf(reel("network-1")), cachedFeed = null)

        vm.state.test {
            assertThat(awaitItem().isLoading).isFalse() // initial default state

            vm.load()

            val seeding = awaitItem()
            assertThat(seeding.reels).isEmpty()
            assertThat(seeding.isLoading).isTrue()

            val loaded = awaitItem()
            assertThat(loaded.reels.map { it.id }).containsExactly("network-1")
            assertThat(loaded.isLoading).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `load degrades to the cache-seeded reels, never blank, when the network fails`() = runTest {
        val cached = listOf(reel("cached-1"))
        val vm = viewModel(cachedFeed = cached)
        coEvery { repository.getReelsPage(any(), any(), any()) } returns NetworkResult.Failure(ApiError("offline"))

        vm.load()

        assertThat(vm.state.value.reels.map { it.id }).containsExactly("cached-1")
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `load surfaces the network error when there is no cache to fall back on`() = runTest {
        val vm = viewModel(cachedFeed = null)
        coEvery { repository.getReelsPage(any(), any(), any()) } returns NetworkResult.Failure(ApiError("offline"))

        vm.load()

        assertThat(vm.state.value.reels).isEmpty()
        assertThat(vm.state.value.errorMessage).isEqualTo("offline")
    }

    @Test
    fun `load moves the cache-seeded reel matching the tapped seed to the front`() = runTest {
        val cached = listOf(reel("a"), reel("b"), reel("tapped"))
        val vm = viewModel(cachedFeed = cached)
        coEvery { repository.getReelsPage(any(), any(), any()) } returns NetworkResult.Failure(ApiError("offline"))

        vm.load(seed = "tapped")

        assertThat(vm.state.value.reels.map { it.id }).containsExactly("tapped", "a", "b").inOrder()
    }

    @Test
    fun `load pins the cache-seeded reel in place once the network page lands, even though the gateway excludes it`() = runTest {
        // The gateway's getReels contract excludes [seed] from every page it returns — the
        // network page below never carries "r5" back, exactly like production. The seed reel
        // must stay the pager's page 0 rather than being swept away by the replacement, and
        // the rest of the cache-seeded thread survives too (the network page only APPENDS).
        val cached = (1..10).map { reel("r$it") }
        val vm = viewModel(cachedFeed = cached)
        coEvery { repository.getReelsPage("r5", any(), any()) } returns
            NetworkResult.Success(PostPage(posts = listOf(reel("other-1"), reel("other-2")), nextCursor = null, hasMore = false))

        vm.load(seed = "r5")

        assertThat(vm.state.value.reels.first().id).isEqualTo("r5")
        assertThat(vm.state.value.reels.map { it.id }).contains("r5")
        assertThat(vm.state.value.reels.map { it.id }).containsAtLeast("other-1", "other-2")
    }

    @Test
    fun `load fetches a seed absent from the feed cache explicitly and pins it at the front`() = runTest {
        // The common case for a notification tap: the reel was never rendered by the
        // Feed, so it is nowhere in feedCacheSnapshot. The gateway's getReels contract
        // still excludes it from every page, so without an explicit fetch the tapped
        // reel would never appear in its own thread.
        val vm = viewModel(cachedFeed = listOf(reel("unrelated")))
        coEvery { repository.getPost("tapped") } returns NetworkResult.Success(reel("tapped"))
        coEvery { repository.getReelsPage("tapped", any(), any()) } returns
            NetworkResult.Success(PostPage(posts = listOf(reel("other-1")), nextCursor = null, hasMore = false))

        vm.load(seed = "tapped")

        assertThat(vm.state.value.reels.map { it.id }).containsExactly("tapped", "unrelated", "other-1").inOrder()
    }

    @Test
    fun `load never duplicates a seed that both the explicit fetch and the network page could resolve`() = runTest {
        val vm = viewModel(cachedFeed = null)
        coEvery { repository.getPost("tapped") } returns NetworkResult.Success(reel("tapped"))
        coEvery { repository.getReelsPage("tapped", any(), any()) } returns
            NetworkResult.Success(PostPage(posts = listOf(reel("tapped"), reel("other-1")), nextCursor = null, hasMore = false))

        vm.load(seed = "tapped")

        assertThat(vm.state.value.reels.map { it.id }).containsExactly("tapped", "other-1").inOrder()
    }

    @Test
    fun `load leaves the thread to the network page alone when the explicit seed fetch fails`() = runTest {
        val vm = viewModel(cachedFeed = null)
        coEvery { repository.getPost("tapped") } returns NetworkResult.Failure(ApiError("offline"))
        coEvery { repository.getReelsPage("tapped", any(), any()) } returns
            NetworkResult.Success(PostPage(posts = listOf(reel("other-1")), nextCursor = null, hasMore = false))

        vm.load(seed = "tapped")

        assertThat(vm.state.value.reels.map { it.id }).containsExactly("other-1")
    }

    @Test
    fun `load does not fetch the seed explicitly when it is already in the feed cache`() = runTest {
        val vm = viewModel(cachedFeed = listOf(reel("tapped")))
        coEvery { repository.getReelsPage("tapped", any(), any()) } returns
            NetworkResult.Success(PostPage(posts = emptyList(), nextCursor = null, hasMore = false))

        vm.load(seed = "tapped")

        coVerify(exactly = 0) { repository.getPost(any()) }
    }

    @Test
    fun `load replaces the thread wholesale when there was no seed to pin`() = runTest {
        val cached = listOf(reel("cached-1"))
        val vm = viewModel(cachedFeed = cached)
        coEvery { repository.getReelsPage(null, any(), any()) } returns
            NetworkResult.Success(PostPage(posts = listOf(reel("network-1")), nextCursor = null, hasMore = false))

        vm.load()

        assertThat(vm.state.value.reels.map { it.id }).containsExactly("network-1")
    }

    // MARK: - Infinite cursor pagination

    @Test
    fun `loadMore appends the next cursor page, deduplicated against the current thread`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1")), nextCursor = "cur2", hasMore = true)
        vm.load()
        coEvery { repository.getReelsPage(null, "cur2", any()) } returns
            NetworkResult.Success(PostPage(posts = listOf(reel("r1"), reel("r2")), nextCursor = null, hasMore = false))

        vm.loadMore()

        assertThat(vm.state.value.reels.map { it.id }).containsExactly("r1", "r2").inOrder()
        assertThat(vm.state.value.isLoadingMore).isFalse()
    }

    @Test
    fun `loadMore preserves the cursor on failure so a retry can pick up from the same page`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1")), nextCursor = "cur2", hasMore = true)
        vm.load()
        coEvery { repository.getReelsPage(null, "cur2", any()) } returns NetworkResult.Failure(ApiError("offline"))

        vm.loadMore()

        assertThat(vm.state.value.reels.map { it.id }).containsExactly("r1")
        assertThat(vm.state.value.isLoadingMore).isFalse()

        // Retry succeeds from the SAME cursor — nothing was reset by the failed attempt.
        coEvery { repository.getReelsPage(null, "cur2", any()) } returns
            NetworkResult.Success(PostPage(posts = listOf(reel("r1"), reel("r2")), nextCursor = null, hasMore = false))
        vm.loadMore()

        assertThat(vm.state.value.reels.map { it.id }).containsExactly("r1", "r2").inOrder()
    }

    @Test
    fun `loadMore carries the entry seed forward on every subsequent page`() = runTest {
        // The gateway excludes the seed post from candidates only on calls that name it
        // (`id: not seedReelId`) — a page fetched without it could let that exact reel
        // resurface later in the thread. Mirrors iOS `ReelsViewModel.fetch`.
        val vm = viewModel(thread = listOf(reel("r1")), nextCursor = "cur2", hasMore = true)
        vm.load(seed = "tapped")
        coEvery { repository.getReelsPage("tapped", "cur2", any()) } returns
            NetworkResult.Success(PostPage(posts = listOf(reel("r2")), nextCursor = null, hasMore = false))

        vm.loadMore()

        coVerify(exactly = 1) { repository.getReelsPage("tapped", "cur2", any()) }
        assertThat(vm.state.value.reels.map { it.id }).containsExactly("r1", "r2").inOrder()
    }

    @Test
    fun `loadMore is a no-op once the thread is exhausted`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1")), nextCursor = null, hasMore = false)
        vm.load()

        vm.loadMore()

        coVerify(exactly = 1) { repository.getReelsPage(any(), any(), any()) }
    }

    @Test
    fun `loadMore before any load is a no-op`() = runTest {
        val vm = viewModel()

        vm.loadMore()

        coVerify(exactly = 0) { repository.getReelsPage(any(), any(), any()) }
    }

    // MARK: - Optimistic bookmark

    @Test
    fun `toggleBookmark bookmarks optimistically and calls the api`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1", bookmarkCount = 2, isBookmarkedByMe = false)))
        vm.load()
        coEvery { repository.bookmark("r1") } returns NetworkResult.Success(Unit)

        vm.toggleBookmark("r1")

        assertThat(vm.state.value.reels.single().isBookmarked).isTrue()
        assertThat(vm.state.value.reels.single().bookmarkCount).isEqualTo(3)
        coVerify(exactly = 1) { repository.bookmark("r1") }
    }

    @Test
    fun `toggleBookmark removes when already bookmarked`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1", bookmarkCount = 5, isBookmarkedByMe = true)))
        vm.load()
        coEvery { repository.removeBookmark("r1") } returns NetworkResult.Success(Unit)

        vm.toggleBookmark("r1")

        assertThat(vm.state.value.reels.single().isBookmarked).isFalse()
        assertThat(vm.state.value.reels.single().bookmarkCount).isEqualTo(4)
        coVerify(exactly = 1) { repository.removeBookmark("r1") }
    }

    @Test
    fun `toggleBookmark rolls back on failure`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1", bookmarkCount = 2, isBookmarkedByMe = false)))
        vm.load()
        coEvery { repository.bookmark("r1") } returns NetworkResult.Failure(ApiError("offline"))

        vm.toggleBookmark("r1")

        assertThat(vm.state.value.reels.single().isBookmarked).isFalse()
        assertThat(vm.state.value.reels.single().bookmarkCount).isEqualTo(2)
    }

    @Test
    fun `a live post-bookmarked reconciles the optimistic toggle to the gateway's absolute count`() = runTest {
        coEvery { repository.bookmark("r1") } returns NetworkResult.Success(Unit)
        val vm = viewModel(thread = listOf(reel("r1", bookmarkCount = 2, isBookmarkedByMe = false)))
        vm.load()
        vm.toggleBookmark("r1")
        assertThat(vm.state.value.reels.single().bookmarkCount).isEqualTo(3)

        // The gateway counted a second device's bookmark racing ours; its absolute count wins.
        postBookmarked.tryEmit(SocketPostBookmarkedData(postId = "r1", bookmarked = true, bookmarkCount = 5))

        assertThat(vm.state.value.reels.single().bookmarkCount).isEqualTo(5)
        assertThat(vm.state.value.reels.single().isBookmarked).isTrue()
    }

    @Test
    fun `toggleBookmark routes through the durable outbox toggle when the reel is in the feed cache`() = runTest {
        coEvery { repository.toggleBookmark("r1") } returns true
        val vm = viewModel(thread = listOf(reel("r1", bookmarkCount = 2, isBookmarkedByMe = false)))
        vm.load()

        vm.toggleBookmark("r1")

        coVerify(exactly = 1) { repository.toggleBookmark("r1") }
        coVerify(exactly = 0) { repository.bookmark(any()) }
        coVerify(exactly = 0) { repository.removeBookmark(any()) }
        assertThat(vm.state.value.reels.single().isBookmarked).isTrue()
        assertThat(vm.state.value.reels.single().bookmarkCount).isEqualTo(3)
    }

    @Test
    fun `toggleLike routes through the durable outbox toggle when the reel is in the feed cache`() = runTest {
        coEvery { repository.toggleLike("r1") } returns true
        val vm = viewModel(thread = listOf(reel("r1", likeCount = 3, isLikedByMe = false)))
        vm.load()

        vm.toggleLike("r1")

        coVerify(exactly = 1) { repository.toggleLike("r1") }
        coVerify(exactly = 0) { repository.like(any()) }
        coVerify(exactly = 0) { repository.unlike(any()) }
        assertThat(vm.state.value.reels.single().isLiked).isTrue()
        assertThat(vm.state.value.reels.single().likeCount).isEqualTo(4)
    }

    @Test
    fun `a live post-bookmarked only touches the reel it names`() = runTest {
        val vm = viewModel(thread = listOf(reel("r1", bookmarkCount = 1), reel("r2", bookmarkCount = 2)))
        vm.load()

        postBookmarked.tryEmit(SocketPostBookmarkedData(postId = "r2", bookmarked = true, bookmarkCount = 9))

        assertThat(vm.state.value.reels.map { it.bookmarkCount }).containsExactly(1, 9).inOrder()
        assertThat(vm.state.value.reels.first { it.id == "r1" }.isBookmarked).isFalse()
    }
}
