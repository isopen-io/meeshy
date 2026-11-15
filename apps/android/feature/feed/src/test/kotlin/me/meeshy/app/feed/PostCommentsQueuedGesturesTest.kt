package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
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
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.model.SocketCommentReactionUpdateData
import me.meeshy.sdk.model.SocketCommentTranslationUpdatedData
import me.meeshy.sdk.model.SocketCommentUpdatedData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.post.CommentGestureQueue
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PostCommentsQueuedGesturesTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val queue: CommentGestureQueue = mockk(relaxed = true)

    private fun viewModel(online: Boolean): PostCommentsViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        every { socialSocket.commentAdded } returns MutableSharedFlow<SocketCommentAddedData>()
        every { socialSocket.commentUpdated } returns MutableSharedFlow<SocketCommentUpdatedData>()
        every { socialSocket.commentDeleted } returns MutableSharedFlow<SocketCommentDeletedData>()
        every { socialSocket.commentReactionAdded } returns MutableSharedFlow<SocketCommentReactionUpdateData>()
        every { socialSocket.commentReactionRemoved } returns MutableSharedFlow<SocketCommentReactionUpdateData>()
        every { socialSocket.commentTranslationUpdated } returns MutableSharedFlow<SocketCommentTranslationUpdatedData>()
        every { queue.rollbacks } returns MutableSharedFlow()
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(ApiPostComment(id = "a", content = "hi")))
        return PostCommentsViewModel(
            repository, session, socialSocket, MeeshyConfig(), mockk<MentionSearch>(relaxed = true),
            SavedStateHandle(mapOf("postId" to "p1")),
            network = InMemoryNetworkMonitor(initialOnline = online),
            gestureQueue = queue,
        )
    }

    @Test
    fun `offline, a heart shows at once, goes to the queue and sends no request`() = runTest {
        coEvery { queue.queueLike("p1", "a", true) } returns true
        val vm = viewModel(online = false)

        vm.toggleLike("a")

        vm.state.test { assertThat(awaitItem().comments.single { it.id == "a" }.isLiked).isTrue() }
        coVerify(exactly = 1) { queue.queueLike("p1", "a", true) }
        coVerify(exactly = 0) { repository.likeComment(any(), any()) }
    }

    @Test
    fun `a heart whose request fails on the network is queued instead of undone`() = runTest {
        coEvery { repository.likeComment("p1", "a") } returns NetworkResult.Failure(ApiError(message = "offline"))
        coEvery { queue.queueLike("p1", "a", true) } returns true
        val vm = viewModel(online = true)

        vm.toggleLike("a")

        vm.state.test { assertThat(awaitItem().comments.single { it.id == "a" }.isLiked).isTrue() }
        coVerify(exactly = 1) { queue.queueLike("p1", "a", true) }
    }

    @Test
    fun `a definitive refusal of the gateway undoes the heart and queues nothing`() = runTest {
        coEvery { repository.likeComment("p1", "a") } returns
            NetworkResult.Failure(ApiError(message = "gone", code = "COMMENT_NOT_FOUND", httpStatus = 404))
        val vm = viewModel(online = true)

        vm.toggleLike("a")

        vm.state.test { assertThat(awaitItem().comments.single { it.id == "a" }.isLiked).isFalse() }
        coVerify(exactly = 0) { queue.queueLike(any(), any(), any()) }
    }

    @Test
    fun `offline, a deletion removes the comment at once and goes to the queue`() = runTest {
        coEvery { queue.queueDelete("p1", "a") } returns true
        val vm = viewModel(online = false)

        vm.deleteComment("a")

        vm.state.test { assertThat(awaitItem().comments.map { it.id }).doesNotContain("a") }
        coVerify(exactly = 1) { queue.queueDelete("p1", "a") }
        coVerify(exactly = 0) { repository.deleteComment(any(), any()) }
    }
}
