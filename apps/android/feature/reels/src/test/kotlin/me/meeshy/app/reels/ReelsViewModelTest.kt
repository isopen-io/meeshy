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
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.model.SocketPostUnlikedData
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
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
    private val config = MeeshyConfig()
    private var clockNow: Long = 0L
    private val clock = object : CacheClock {
        override fun nowMillis(): Long = clockNow
    }

    private fun reel(
        id: String,
        likeCount: Int = 0,
        isLikedByMe: Boolean = false,
    ) = ApiPost(
        id = id,
        likeCount = likeCount,
        isLikedByMe = isLikedByMe,
        media = listOf(
            ApiPostMedia(id = "m-$id", mimeType = "video/mp4", fileUrl = "https://cdn.test/$id.mp4"),
        ),
    )

    private fun viewModel(
        thread: List<ApiPost> = emptyList(),
        currentUserId: String? = "me",
    ): ReelsViewModel {
        every { session.currentUserId } returns currentUserId
        every { socialSocket.postLiked } returns postLiked
        every { socialSocket.postUnliked } returns postUnliked
        coEvery { repository.getReels(any(), any(), any()) } returns NetworkResult.Success(thread)
        return ReelsViewModel(repository, session, socialSocket, config, clock)
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
}
