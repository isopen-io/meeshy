package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
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
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.model.SocketCommentReactionUpdateData
import me.meeshy.sdk.model.SocketCommentTranslationUpdatedData
import me.meeshy.sdk.model.SocketCommentUpdatedData
import me.meeshy.sdk.model.mention.MentionContext
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/** #16541 — une publication aux commentaires fermés garde son fil lisible ; le composeur cède la place au bandeau. */
@OptIn(ExperimentalCoroutinesApi::class)
class PostCommentsClosedTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)

    private val existing = ApiPostComment(id = "c1", content = "Bonjour")

    private object NoMention : MentionSearch {
        override suspend fun search(query: String): List<MentionCandidate> = emptyList()
        override suspend fun suggest(query: String, context: MentionContext?): List<MentionCandidate> = emptyList()
    }

    private fun viewModel(): PostCommentsViewModel {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(existing))
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        every { socialSocket.commentAdded } returns MutableSharedFlow<SocketCommentAddedData>(extraBufferCapacity = 8)
        every { socialSocket.commentUpdated } returns MutableSharedFlow<SocketCommentUpdatedData>(extraBufferCapacity = 8)
        every { socialSocket.commentDeleted } returns MutableSharedFlow<SocketCommentDeletedData>(extraBufferCapacity = 8)
        every { socialSocket.commentReactionAdded } returns MutableSharedFlow<SocketCommentReactionUpdateData>(extraBufferCapacity = 8)
        every { socialSocket.commentReactionRemoved } returns MutableSharedFlow<SocketCommentReactionUpdateData>(extraBufferCapacity = 8)
        every { socialSocket.commentTranslationUpdated } returns MutableSharedFlow<SocketCommentTranslationUpdatedData>(extraBufferCapacity = 8)
        return PostCommentsViewModel(repository, session, socialSocket, MeeshyConfig(), NoMention, SavedStateHandle(mapOf("postId" to "p1")))
    }

    @Test
    fun `a post served closed keeps its comments readable and sends nothing`() = runTest {
        val vm = viewModel()
        vm.setCommentsClosed(true)
        vm.onDraftChange("Salut")
        vm.submit()

        assertThat(vm.state.value.commentsClosed).isTrue()
        assertThat(vm.state.value.comments.map { it.id }).containsExactly("c1")
        coVerify(exactly = 0) { repository.addComment(any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a COMMENTS_DISABLED refusal closes the thread, drops the optimistic row and keeps the text`() = runTest {
        coEvery { repository.addComment(any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "Comments are disabled", code = "COMMENTS_DISABLED", httpStatus = 403))
        val vm = viewModel()
        vm.onDraftChange("Salut")
        vm.submit()

        val s = vm.state.value
        assertThat(s.commentsClosed).isTrue()
        assertThat(s.comments.map { it.id }).containsExactly("c1")
        assertThat(s.notice).isNull()
        assertThat(s.draft).isEqualTo("Salut")
    }

    @Test
    fun `any other refusal leaves the thread open and says the send failed`() = runTest {
        coEvery { repository.addComment(any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "INTERNAL_ERROR"))
        val vm = viewModel()
        vm.onDraftChange("Salut")
        vm.submit()

        assertThat(vm.state.value.commentsClosed).isFalse()
        assertThat(vm.state.value.notice).isEqualTo(CommentNotice.SEND_FAILED)
    }

    @Test
    fun `closing drops the reply target and a reopened post accepts comments again`() = runTest {
        val vm = viewModel()
        vm.beginReply("c1")
        vm.setCommentsClosed(true)
        assertThat(vm.state.value.replyTarget).isNull()
        vm.beginReply("c1")
        assertThat(vm.state.value.replyTarget).isNull()

        vm.setCommentsClosed(false)
        vm.beginReply("c1")
        assertThat(vm.state.value.commentsClosed).isFalse()
        assertThat(vm.state.value.replyTarget?.commentId).isEqualTo("c1")
    }
}
