package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
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
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.model.SocketCommentReactionUpdateData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PostCommentsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val commentAdded = MutableSharedFlow<SocketCommentAddedData>(extraBufferCapacity = 64)
    private val commentDeleted = MutableSharedFlow<SocketCommentDeletedData>(extraBufferCapacity = 64)
    private val commentReactionAdded = MutableSharedFlow<SocketCommentReactionUpdateData>(extraBufferCapacity = 64)
    private val commentReactionRemoved = MutableSharedFlow<SocketCommentReactionUpdateData>(extraBufferCapacity = 64)
    private val config = MeeshyConfig()

    private fun comment(id: String, content: String = "hi", parentId: String? = null) =
        ApiPostComment(id = id, content = content, parentId = parentId)

    private fun page(n: Int) = (1..n).map { comment("s$it") }

    private fun viewModel(
        postId: String? = "p1",
        user: MeeshyUser? = MeeshyUser(id = "me", username = "me"),
    ): PostCommentsViewModel {
        every { session.currentUser } returns MutableStateFlow(user)
        every { socialSocket.commentAdded } returns commentAdded
        every { socialSocket.commentDeleted } returns commentDeleted
        every { socialSocket.commentReactionAdded } returns commentReactionAdded
        every { socialSocket.commentReactionRemoved } returns commentReactionRemoved
        val handle = SavedStateHandle(if (postId == null) emptyMap() else mapOf("postId" to postId))
        return PostCommentsViewModel(repository, session, socialSocket, config, handle)
    }

    @Test
    fun `loadInitial populates the comment list`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a"), comment("b")))

        val vm = viewModel()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.comments.map { it.id }).containsExactly("a", "b").inOrder()
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.isEmpty).isFalse()
        }
    }

    @Test
    fun `loadInitial forwards the route postId`() = runTest {
        coEvery { repository.getComments("p42", null, any()) } returns NetworkResult.Success(emptyList())
        viewModel(postId = "p42")
        coVerify(exactly = 1) { repository.getComments("p42", null, any()) }
    }

    @Test
    fun `a blank postId never hits the network and shows empty`() = runTest {
        val vm = viewModel(postId = null)
        vm.state.test {
            val s = awaitItem()
            assertThat(s.isEmpty).isTrue()
            assertThat(s.showSkeleton).isFalse()
        }
        coVerify(exactly = 0) { repository.getComments(any(), any(), any()) }
    }

    @Test
    fun `cold load shows a skeleton until comments arrive`() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<ApiPostComment>>>()
        coEvery { repository.getComments("p1", null, any()) } coAnswers { gate.await() }

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().showSkeleton).isTrue()
            gate.complete(NetworkResult.Success(listOf(comment("a"))))
            val settled = awaitItem()
            assertThat(settled.showSkeleton).isFalse()
            assertThat(settled.comments).hasSize(1)
        }
    }

    @Test
    fun `empty result settles to the empty state`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.state.test {
            val s = awaitItem()
            assertThat(s.isEmpty).isTrue()
            assertThat(s.showSkeleton).isFalse()
        }
    }

    @Test
    fun `failure surfaces an error and no skeleton`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Failure(ApiError(message = "boom"))
        val vm = viewModel()
        vm.state.test {
            val s = awaitItem()
            assertThat(s.errorMessage).isEqualTo("boom")
            assertThat(s.showSkeleton).isFalse()
        }
    }

    @Test
    fun `loadInitial is guarded after the first load`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("a")))
        val vm = viewModel()
        vm.loadInitial()
        coVerify(exactly = 1) { repository.getComments("p1", null, any()) }
    }

    @Test
    fun `a full page enables load-more with the last id as cursor`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(page(20))
        val vm = viewModel()
        vm.state.test {
            assertThat(awaitItem().canLoadMore).isTrue()
        }
        coEvery { repository.getComments("p1", "s20", any()) } returns NetworkResult.Success(listOf(comment("x")))
        vm.loadMore()
        coVerify(exactly = 1) { repository.getComments("p1", "s20", any()) }
    }

    @Test
    fun `a short page does not enable load-more`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(page(3))
        val vm = viewModel()
        vm.state.test { assertThat(awaitItem().canLoadMore).isFalse() }
        vm.loadMore()
        coVerify(exactly = 0) { repository.getComments("p1", "s3", any()) }
    }

    @Test
    fun `submit optimistically prepends then confirms with the server row`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("a")))
        coEvery { repository.addComment("p1", "Bonjour", any(), any()) } returns
            NetworkResult.Success(comment("real", content = "Bonjour"))
        val vm = viewModel()
        vm.submit("  Bonjour  ")
        vm.state.test {
            val s = awaitItem()
            assertThat(s.comments.first().id).isEqualTo("real")
            assertThat(s.comments.first().content).isEqualTo("Bonjour")
            assertThat(s.comments.map { it.id }).containsExactly("real", "a").inOrder()
        }
        coVerify(exactly = 1) { repository.addComment("p1", "Bonjour", null, null) }
    }

    @Test
    fun `submit rolls back the optimistic row on failure and surfaces an error`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("a")))
        coEvery { repository.addComment("p1", any(), any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "nope"))
        val vm = viewModel()
        vm.submit("hi")
        vm.state.test {
            val s = awaitItem()
            assertThat(s.comments.map { it.id }).containsExactly("a")
            assertThat(s.errorMessage).isEqualTo("nope")
        }
    }

    @Test
    fun `submit is inert for blank content`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.submit("   ")
        coVerify(exactly = 0) { repository.addComment(any(), any(), any(), any()) }
    }

    @Test
    fun `submit is inert for a blank postId`() = runTest {
        val vm = viewModel(postId = null)
        vm.submit("hi")
        coVerify(exactly = 0) { repository.addComment(any(), any(), any(), any()) }
    }

    private fun likedComment(id: String) =
        ApiPostComment(id = id, likeCount = 2, currentUserReactions = listOf("❤️"))

    @Test
    fun `a loaded like from the server seeds the liked state`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(likedComment("a"), comment("b")))
        val vm = viewModel()
        vm.state.test {
            val s = awaitItem()
            assertThat(s.comments.single { it.id == "a" }.isLiked).isTrue()
            assertThat(s.comments.single { it.id == "b" }.isLiked).isFalse()
        }
    }

    @Test
    fun `toggleLike optimistically likes an unliked comment and calls likeComment`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("a")))
        coEvery { repository.likeComment("p1", "a") } returns NetworkResult.Success(Unit)
        val vm = viewModel()
        vm.toggleLike("a")
        vm.state.test {
            val s = awaitItem()
            assertThat(s.comments.single { it.id == "a" }.isLiked).isTrue()
        }
        coVerify(exactly = 1) { repository.likeComment("p1", "a") }
        coVerify(exactly = 0) { repository.unlikeComment(any(), any()) }
    }

    @Test
    fun `toggleLike optimistically unlikes a liked comment and calls unlikeComment`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(likedComment("a")))
        coEvery { repository.unlikeComment("p1", "a") } returns NetworkResult.Success(Unit)
        val vm = viewModel()
        vm.toggleLike("a")
        vm.state.test {
            val s = awaitItem()
            assertThat(s.comments.single { it.id == "a" }.isLiked).isFalse()
            assertThat(s.comments.single { it.id == "a" }.likeCount).isEqualTo(1)
        }
        coVerify(exactly = 1) { repository.unlikeComment("p1", "a") }
    }

    @Test
    fun `toggleLike rolls back the optimistic like when the network fails`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("a")))
        coEvery { repository.likeComment("p1", "a") } returns NetworkResult.Failure(ApiError(message = "nope"))
        val vm = viewModel()
        vm.toggleLike("a")
        vm.state.test {
            assertThat(awaitItem().comments.single { it.id == "a" }.isLiked).isFalse()
        }
    }

    @Test
    fun `toggleLike guards a double tap so only one network call fires`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("a")))
        val gate = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { repository.likeComment("p1", "a") } coAnswers { gate.await() }
        val vm = viewModel()
        vm.toggleLike("a")
        vm.toggleLike("a")
        gate.complete(NetworkResult.Success(Unit))
        coVerify(exactly = 1) { repository.likeComment("p1", "a") }
    }

    @Test
    fun `toggleLike is inert for a blank postId`() = runTest {
        val vm = viewModel(postId = null)
        vm.toggleLike("a")
        coVerify(exactly = 0) { repository.likeComment(any(), any()) }
        coVerify(exactly = 0) { repository.unlikeComment(any(), any()) }
    }

    @Test
    fun `toggleLike is inert for a blank commentId`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("a")))
        val vm = viewModel()
        vm.toggleLike("  ")
        coVerify(exactly = 0) { repository.likeComment(any(), any()) }
    }

    // --- Reply threads (1-level) ---

    private fun reply(id: String, parentId: String, content: String = "r") =
        ApiPostComment(id = id, content = content, parentId = parentId)

    @Test
    fun `toggleReplies expands the thread and loads its replies under the parent`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("c1")))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(listOf(reply("r1", "c1"), reply("r2", "c1")))
        val vm = viewModel()
        vm.toggleReplies("c1")
        vm.state.test {
            val thread = awaitItem().replyThreads.getValue("c1")
            assertThat(thread.isExpanded).isTrue()
            assertThat(thread.isLoading).isFalse()
            assertThat(thread.replies.map { it.id }).containsExactly("r1", "r2").inOrder()
        }
        coVerify(exactly = 1) { repository.getCommentReplies("p1", "c1", null, any()) }
    }

    @Test
    fun `collapsing an expanded thread falls back to its reply preview`() = runTest {
        // Collapse no longer hides the thread outright — it drops back to the loaded preview
        // (iOS keeps `repliesMap` populated after a collapse). "Hide replies" ⇒ show the taste.
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("c1")))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(listOf(reply("r1", "c1"), reply("r2", "c1"), reply("r3", "c1")))
        val vm = viewModel()
        vm.toggleReplies("c1") // expand + load
        vm.toggleReplies("c1") // collapse → preview
        vm.state.test {
            val thread = awaitItem().replyThreads.getValue("c1")
            assertThat(thread.isExpanded).isFalse()
            assertThat(thread.isPreview).isTrue()
            assertThat(thread.replies.map { it.id }).containsExactly("r1", "r2").inOrder()
            assertThat(thread.hiddenReplyCount).isEqualTo(1)
        }
    }

    @Test
    fun `re-expanding a loaded thread does not refetch the replies`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("c1")))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(listOf(reply("r1", "c1")))
        val vm = viewModel()
        vm.toggleReplies("c1") // expand + load
        vm.toggleReplies("c1") // collapse
        vm.toggleReplies("c1") // re-expand — should reuse cached replies
        vm.state.test {
            val thread = awaitItem().replyThreads.getValue("c1")
            assertThat(thread.replies.map { it.id }).containsExactly("r1")
        }
        coVerify(exactly = 1) { repository.getCommentReplies("p1", "c1", null, any()) }
    }

    @Test
    fun `a reply-load failure collapses the thread`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("c1")))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Failure(ApiError(message = "boom"))
        val vm = viewModel()
        vm.toggleReplies("c1")
        vm.state.test {
            assertThat(awaitItem().replyThreads).doesNotContainKey("c1")
        }
    }

    @Test
    fun `toggleReplies guards a double tap so only one reply fetch fires`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("c1")))
        val gate = CompletableDeferred<NetworkResult<List<ApiPostComment>>>()
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } coAnswers { gate.await() }
        val vm = viewModel()
        vm.toggleReplies("c1") // expand + begin load
        vm.toggleReplies("c1") // collapse
        vm.toggleReplies("c1") // re-expand while load still in flight → must not refetch
        gate.complete(NetworkResult.Success(listOf(reply("r1", "c1"))))
        coVerify(exactly = 1) { repository.getCommentReplies("p1", "c1", null, any()) }
    }

    @Test
    fun `toggleReplies is inert for a blank commentId`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("c1")))
        val vm = viewModel()
        vm.toggleReplies("  ")
        coVerify(exactly = 0) { repository.getCommentReplies(any(), any(), any(), any()) }
    }

    @Test
    fun `toggleReplies is inert for a blank postId`() = runTest {
        val vm = viewModel(postId = null)
        vm.toggleReplies("c1")
        coVerify(exactly = 0) { repository.getCommentReplies(any(), any(), any(), any()) }
    }

    @Test
    fun `a reply mixed into the top-level page is not rendered as a top-level comment`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("c1"), reply("r1", "c1")))
        val vm = viewModel()
        vm.state.test {
            assertThat(awaitItem().comments.map { it.id }).containsExactly("c1")
        }
    }

    @Test
    fun `toggleLike likes a loaded reply row`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("c1")))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(listOf(reply("r1", "c1")))
        coEvery { repository.likeComment("p1", "r1") } returns NetworkResult.Success(Unit)
        val vm = viewModel()
        vm.toggleReplies("c1")
        vm.toggleLike("r1")
        vm.state.test {
            val thread = awaitItem().replyThreads.getValue("c1")
            assertThat(thread.replies.single { it.id == "r1" }.isLiked).isTrue()
        }
        coVerify(exactly = 1) { repository.likeComment("p1", "r1") }
    }

    // --- Reply composition ---

    private fun authored(id: String, parentId: String? = null, name: String = "Alice") =
        ApiPostComment(
            id = id,
            content = "hi",
            parentId = parentId,
            author = ApiAuthor(id = "u_$id", username = name.lowercase(), displayName = name),
        )

    @Test
    fun `beginReply targets a top-level comment with its author name`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(authored("c1")))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.beginReply("c1")
        vm.state.test {
            val target = awaitItem().replyTarget
            assertThat(target?.parentId).isEqualTo("c1")
            assertThat(target?.authorName).isEqualTo("Alice")
        }
    }

    @Test
    fun `beginReply on a reply row targets the root parent for flat 2-level threading`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(authored("c1")))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(listOf(authored("r1", parentId = "c1", name = "Bob")))
        val vm = viewModel()
        vm.toggleReplies("c1")
        vm.beginReply("r1")
        vm.state.test {
            val target = awaitItem().replyTarget
            assertThat(target?.parentId).isEqualTo("c1")
            assertThat(target?.authorName).isEqualTo("Bob")
        }
    }

    @Test
    fun `beginReply expands and loads the parent thread for context`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(authored("c1")))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(listOf(reply("r1", "c1")))
        val vm = viewModel()
        vm.beginReply("c1")
        vm.state.test {
            assertThat(awaitItem().replyThreads).containsKey("c1")
        }
        coVerify(exactly = 1) { repository.getCommentReplies("p1", "c1", null, any()) }
    }

    @Test
    fun `beginReply does not refetch an already-loaded thread`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(authored("c1")))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(listOf(reply("r1", "c1")))
        val vm = viewModel()
        vm.toggleReplies("c1")
        vm.beginReply("c1")
        coVerify(exactly = 1) { repository.getCommentReplies("p1", "c1", null, any()) }
    }

    @Test
    fun `beginReply is inert for a blank commentId`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(authored("c1")))
        val vm = viewModel()
        vm.beginReply("  ")
        vm.state.test { assertThat(awaitItem().replyTarget).isNull() }
    }

    @Test
    fun `beginReply is inert for a blank postId`() = runTest {
        val vm = viewModel(postId = null)
        vm.beginReply("c1")
        vm.state.test { assertThat(awaitItem().replyTarget).isNull() }
        coVerify(exactly = 0) { repository.getCommentReplies(any(), any(), any(), any()) }
    }

    @Test
    fun `cancelReply clears the reply target`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(authored("c1")))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.beginReply("c1")
        vm.cancelReply()
        vm.state.test { assertThat(awaitItem().replyTarget).isNull() }
    }

    @Test
    fun `submit with a reply target sends a reply under the parent and clears the target`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(authored("c1")))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns NetworkResult.Success(emptyList())
        coEvery { repository.addComment("p1", "Salut", "c1", any()) } returns
            NetworkResult.Success(reply("real", "c1", content = "Salut"))
        val vm = viewModel()
        vm.beginReply("c1")
        vm.submit("  Salut  ")
        vm.state.test {
            val s = awaitItem()
            assertThat(s.replyTarget).isNull()
            assertThat(s.replyThreads.getValue("c1").replies.map { it.id }).containsExactly("real")
        }
        coVerify(exactly = 1) { repository.addComment("p1", "Salut", "c1", null) }
        coVerify(exactly = 0) { repository.addComment("p1", any(), null, any()) }
    }

    @Test
    fun `a reply appears optimistically in the parent thread before the server confirms`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(authored("c1")))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns NetworkResult.Success(emptyList())
        val gate = CompletableDeferred<NetworkResult<ApiPostComment>>()
        coEvery { repository.addComment("p1", "Hey", "c1", any()) } coAnswers { gate.await() }
        val vm = viewModel()
        vm.beginReply("c1")
        vm.submit("Hey")
        vm.state.test {
            val pending = awaitItem().replyThreads.getValue("c1").replies.single()
            assertThat(pending.content).isEqualTo("Hey")
            assertThat(pending.isPending).isTrue()
            gate.complete(NetworkResult.Success(reply("real", "c1", content = "Hey")))
            val confirmed = awaitItem().replyThreads.getValue("c1").replies.single()
            assertThat(confirmed.id).isEqualTo("real")
            assertThat(confirmed.isPending).isFalse()
        }
    }

    @Test
    fun `sending a reply bumps the parent reply count optimistically`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(authored("c1").copy(replyCount = 2)))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns NetworkResult.Success(emptyList())
        coEvery { repository.addComment("p1", "Hey", "c1", any()) } returns
            NetworkResult.Success(reply("real", "c1"))
        val vm = viewModel()
        vm.beginReply("c1")
        vm.submit("Hey")
        vm.state.test {
            assertThat(awaitItem().comments.single { it.id == "c1" }.replyCount).isEqualTo(3)
        }
    }

    @Test
    fun `a reply send failure rolls back the optimistic reply and its count and surfaces an error`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(authored("c1").copy(replyCount = 2)))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns NetworkResult.Success(emptyList())
        coEvery { repository.addComment("p1", "Hey", "c1", any()) } returns
            NetworkResult.Failure(ApiError(message = "nope"))
        val vm = viewModel()
        vm.beginReply("c1")
        vm.submit("Hey")
        vm.state.test {
            val s = awaitItem()
            assertThat(s.replyThreads.getValue("c1").replies).isEmpty()
            assertThat(s.comments.single { it.id == "c1" }.replyCount).isEqualTo(2)
            assertThat(s.errorMessage).isEqualTo("nope")
        }
    }

    @Test
    fun `submit with no reply target still posts a top-level comment`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(comment("a")))
        coEvery { repository.addComment("p1", "Top", null, any()) } returns
            NetworkResult.Success(comment("real", content = "Top"))
        val vm = viewModel()
        vm.submit("Top")
        vm.state.test {
            assertThat(awaitItem().comments.map { it.id }).containsExactly("real", "a").inOrder()
        }
        coVerify(exactly = 1) { repository.addComment("p1", "Top", null, null) }
    }

    // --- Reply previews (auto-preload) ---

    private fun withReplies(id: String, count: Int) = comment(id).copy(replyCount = count)

    @Test
    fun `previews auto-load for a comment that has replies without a tap`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(withReplies("c1", 3)))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(listOf(reply("r1", "c1"), reply("r2", "c1"), reply("r3", "c1")))
        val vm = viewModel()
        vm.state.test {
            val thread = awaitItem().replyThreads.getValue("c1")
            assertThat(thread.isPreview).isTrue()
            assertThat(thread.isExpanded).isFalse()
            assertThat(thread.replies.map { it.id }).containsExactly("r1", "r2").inOrder()
            assertThat(thread.hiddenReplyCount).isEqualTo(1)
        }
        coVerify(exactly = 1) { repository.getCommentReplies("p1", "c1", null, any()) }
    }

    @Test
    fun `no preview is loaded for a comment with zero replies`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(withReplies("c1", 0)))
        val vm = viewModel()
        vm.state.test {
            assertThat(awaitItem().replyThreads).doesNotContainKey("c1")
        }
        coVerify(exactly = 0) { repository.getCommentReplies(any(), any(), any(), any()) }
    }

    @Test
    fun `preview preloading is capped to the first five comments with replies`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success((1..6).map { withReplies("c$it", 2) })
        coEvery { repository.getCommentReplies("p1", any(), null, any()) } returns
            NetworkResult.Success(listOf(reply("x", "p")))
        val vm = viewModel()
        vm.state.test {
            val threads = awaitItem().replyThreads
            assertThat(threads.keys).containsExactly("c1", "c2", "c3", "c4", "c5")
        }
        coVerify(exactly = 0) { repository.getCommentReplies("p1", "c6", null, any()) }
    }

    @Test
    fun `expanding a previewed thread shows every reply without refetching`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(withReplies("c1", 3)))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(listOf(reply("r1", "c1"), reply("r2", "c1"), reply("r3", "c1")))
        val vm = viewModel()
        vm.toggleReplies("c1") // preview already loaded → this only expands, no second fetch
        vm.state.test {
            val thread = awaitItem().replyThreads.getValue("c1")
            assertThat(thread.isExpanded).isTrue()
            assertThat(thread.replies.map { it.id }).containsExactly("r1", "r2", "r3").inOrder()
        }
        coVerify(exactly = 1) { repository.getCommentReplies("p1", "c1", null, any()) }
    }

    @Test
    fun `a preloaded comment whose replies came back empty shows no preview rows`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(withReplies("c1", 2)))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(emptyList())
        val vm = viewModel()
        vm.state.test {
            val thread = awaitItem().replyThreads.getValue("c1")
            assertThat(thread.isPreview).isFalse()
            assertThat(thread.replies).isEmpty()
            assertThat(thread.hiddenReplyCount).isEqualTo(0)
        }
    }

    // --- Realtime room: live comment:added for the open post ---

    @Test
    fun `a live top-level comment for this post appears at the top`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a"), comment("b")))
        val vm = viewModel()
        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a", "b").inOrder()

        commentAdded.tryEmit(SocketCommentAddedData(postId = "p1", comment = comment("live")))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("live", "a", "b").inOrder()
    }

    @Test
    fun `a live comment for a different post is ignored`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a")))
        val vm = viewModel()

        commentAdded.tryEmit(SocketCommentAddedData(postId = "other", comment = comment("x")))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a")
    }

    @Test
    fun `a live comment is ignored when the route postId is blank`() = runTest {
        val vm = viewModel(postId = null)

        commentAdded.tryEmit(SocketCommentAddedData(postId = "", comment = comment("x")))

        assertThat(vm.state.value.comments).isEmpty()
    }

    @Test
    fun `a duplicate live comment does not double-render`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a")))
        val vm = viewModel()

        commentAdded.tryEmit(SocketCommentAddedData(postId = "p1", comment = comment("a")))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a")
    }

    @Test
    fun `a live reply into a previewed thread appears and bumps the parent reply count`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(withReplies("c1", 1)))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(listOf(reply("r1", "c1")))
        val vm = viewModel()
        // Auto-preview has loaded c1's replies (collapsed preview) — the thread is visible.
        assertThat(vm.state.value.replyThreads.getValue("c1").replies.map { it.id })
            .containsExactly("r1")

        commentAdded.tryEmit(SocketCommentAddedData(postId = "p1", comment = reply("live", "c1")))

        val s = vm.state.value
        assertThat(s.replyThreads.getValue("c1").replies.map { it.id })
            .containsExactly("live", "r1").inOrder()
        assertThat(s.comments.single { it.id == "c1" }.replyCount).isEqualTo(2)
    }

    @Test
    fun `a live reply into an unloaded thread bumps the count without a visible row`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(withReplies("c1", 0)))
        val vm = viewModel()

        commentAdded.tryEmit(SocketCommentAddedData(postId = "p1", comment = reply("live", "c1")))

        val s = vm.state.value
        assertThat(s.comments.single { it.id == "c1" }.replyCount).isEqualTo(1)
        assertThat(s.replyThreads).doesNotContainKey("c1")
    }

    // --- Realtime room: live comment:deleted for the open post ---

    @Test
    fun `a live deleted top-level comment vanishes from the thread`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a"), comment("b"), comment("c")))
        val vm = viewModel()
        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a", "b", "c").inOrder()

        commentDeleted.tryEmit(SocketCommentDeletedData(postId = "p1", commentId = "b", commentCount = 2))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a", "c").inOrder()
    }

    @Test
    fun `a delete for a different post is ignored`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a"), comment("b")))
        val vm = viewModel()

        commentDeleted.tryEmit(SocketCommentDeletedData(postId = "other", commentId = "b"))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `a delete is ignored when the route postId is blank`() = runTest {
        val vm = viewModel(postId = null)

        commentDeleted.tryEmit(SocketCommentDeletedData(postId = "", commentId = "x"))

        assertThat(vm.state.value.comments).isEmpty()
    }

    @Test
    fun `a delete for an unknown comment is a no-op`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a")))
        val vm = viewModel()

        commentDeleted.tryEmit(SocketCommentDeletedData(postId = "p1", commentId = "ghost"))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a")
    }

    @Test
    fun `deleting a top-level comment purges its previewed reply thread`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(withReplies("c1", 1)))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(listOf(reply("r1", "c1")))
        val vm = viewModel()
        assertThat(vm.state.value.replyThreads).containsKey("c1")

        commentDeleted.tryEmit(SocketCommentDeletedData(postId = "p1", commentId = "c1", commentCount = 0))

        val s = vm.state.value
        assertThat(s.comments).isEmpty()
        assertThat(s.replyThreads).doesNotContainKey("c1")
    }

    @Test
    fun `a live deleted reply vanishes and decrements its parent's reply count`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(withReplies("c1", 2)))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns
            NetworkResult.Success(listOf(reply("r1", "c1"), reply("r2", "c1")))
        val vm = viewModel()
        vm.toggleReplies("c1") // expand so both replies are visible
        assertThat(vm.state.value.replyThreads.getValue("c1").replies.map { it.id })
            .containsExactly("r1", "r2").inOrder()

        commentDeleted.tryEmit(SocketCommentDeletedData(postId = "p1", commentId = "r1", commentCount = 2))

        val s = vm.state.value
        assertThat(s.replyThreads.getValue("c1").replies.map { it.id }).containsExactly("r2")
        assertThat(s.comments.single { it.id == "c1" }.replyCount).isEqualTo(1)
    }

    // --- Realtime room: live heart reactions for the open post ---

    private fun reaction(commentId: String, userId: String, postId: String = "p1", emoji: String = "❤️") =
        SocketCommentReactionUpdateData(commentId = commentId, postId = postId, userId = userId, emoji = emoji)

    @Test
    fun `an own live heart reaction lights the comment's heart`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a")))
        val vm = viewModel(user = MeeshyUser(id = "me", username = "me"))
        assertThat(vm.state.value.comments.single { it.id == "a" }.isLiked).isFalse()

        commentReactionAdded.tryEmit(reaction("a", userId = "me"))

        assertThat(vm.state.value.comments.single { it.id == "a" }.isLiked).isTrue()
    }

    @Test
    fun `a third-party live heart reaction bumps the comment's like count`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a").copy(likeCount = 4)))
        val vm = viewModel(user = MeeshyUser(id = "me", username = "me"))
        assertThat(vm.state.value.comments.single { it.id == "a" }.likeCount).isEqualTo(4)

        commentReactionAdded.tryEmit(reaction("a", userId = "stranger"))

        val row = vm.state.value.comments.single { it.id == "a" }
        assertThat(row.likeCount).isEqualTo(5)
        assertThat(row.isLiked).isFalse()
    }

    @Test
    fun `a third-party live heart un-reaction drops the comment's like count`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a").copy(likeCount = 4)))
        val vm = viewModel(user = MeeshyUser(id = "me", username = "me"))
        commentReactionAdded.tryEmit(reaction("a", userId = "stranger"))
        assertThat(vm.state.value.comments.single { it.id == "a" }.likeCount).isEqualTo(5)

        commentReactionRemoved.tryEmit(reaction("a", userId = "stranger"))

        assertThat(vm.state.value.comments.single { it.id == "a" }.likeCount).isEqualTo(4)
    }

    @Test
    fun `a live reaction for a different post is ignored`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a").copy(likeCount = 4)))
        val vm = viewModel()

        commentReactionAdded.tryEmit(reaction("a", userId = "stranger", postId = "other"))

        assertThat(vm.state.value.comments.single { it.id == "a" }.likeCount).isEqualTo(4)
    }

    @Test
    fun `a live non-heart reaction is ignored`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(comment("a").copy(likeCount = 4)))
        val vm = viewModel()

        commentReactionAdded.tryEmit(reaction("a", userId = "stranger", emoji = "🔥"))

        val row = vm.state.value.comments.single { it.id == "a" }
        assertThat(row.likeCount).isEqualTo(4)
        assertThat(row.isLiked).isFalse()
    }

    @Test
    fun `a live reaction is ignored when the route postId is blank`() = runTest {
        val vm = viewModel(postId = null)

        commentReactionAdded.tryEmit(reaction("a", userId = "stranger"))

        assertThat(vm.state.value.comments).isEmpty()
    }
}
