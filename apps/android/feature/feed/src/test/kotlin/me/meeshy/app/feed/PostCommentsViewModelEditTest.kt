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

/** iOS `beginEditComment` / `submitCommentEdit` : le composer charge le commentaire, l'envoi le remplace EN PLACE. */
@OptIn(ExperimentalCoroutinesApi::class)
class PostCommentsViewModelEditTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val commentUpdated = MutableSharedFlow<SocketCommentUpdatedData>(extraBufferCapacity = 64)

    private val mine = ApiPostComment(id = "c1", content = "Hola", originalLanguage = "es", effectFlags = MessageEffectFlags.BLURRED.toInt())
    private val other = ApiPostComment(id = "c2", content = "Autre")

    private object NoMention : MentionSearch {
        override suspend fun search(query: String): List<MentionCandidate> = emptyList()
        override suspend fun suggest(query: String, context: MentionContext?): List<MentionCandidate> = emptyList()
    }

    private fun viewModel(): PostCommentsViewModel {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(mine, other))
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        every { socialSocket.commentAdded } returns MutableSharedFlow<SocketCommentAddedData>(extraBufferCapacity = 8)
        every { socialSocket.commentUpdated } returns commentUpdated
        every { socialSocket.commentDeleted } returns MutableSharedFlow<SocketCommentDeletedData>(extraBufferCapacity = 8)
        every { socialSocket.commentReactionAdded } returns MutableSharedFlow<SocketCommentReactionUpdateData>(extraBufferCapacity = 8)
        every { socialSocket.commentReactionRemoved } returns MutableSharedFlow<SocketCommentReactionUpdateData>(extraBufferCapacity = 8)
        every { socialSocket.commentTranslationUpdated } returns MutableSharedFlow<SocketCommentTranslationUpdatedData>(extraBufferCapacity = 8)
        return PostCommentsViewModel(repository, session, socialSocket, MeeshyConfig(), NoMention, SavedStateHandle(mapOf("postId" to "p1")))
    }

    @Test
    fun `editing loads the text, the blur and the language of the comment into the composer`() = runTest {
        val vm = viewModel()
        vm.beginEdit("c1")
        val s = vm.state.value
        assertThat(s.draft).isEqualTo("Hola")
        assertThat(s.editing?.commentId).isEqualTo("c1")
        assertThat(s.composerLanguageCode).isEqualTo("es")
        assertThat(s.effects.flags).isEqualTo(MessageEffectFlags.BLURRED)
    }

    @Test
    fun `sending replaces the row in place and declares the language of the pill`() = runTest {
        coEvery { repository.updateComment("p1", "c1", "Hola!", 0, "es") } returns NetworkResult.Success(mine.copy(content = "Hola!"))
        val vm = viewModel()
        vm.beginEdit("c1")
        vm.onDraftChange("Hola!")
        vm.clearCommentEffects()
        vm.submit()

        assertThat(vm.state.value.comments.map { it.id to it.content }).containsExactly("c1" to "Hola!", "c2" to "Autre").inOrder()
        assertThat(vm.state.value.editing).isNull()
        assertThat(vm.state.value.draft).isEmpty()
        coVerify(exactly = 1) { repository.updateComment("p1", "c1", "Hola!", 0, "es") }
        coVerify(exactly = 0) { repository.addComment(any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a refusal brings the row back and says so`() = runTest {
        coEvery { repository.updateComment(any(), any(), any(), any(), any()) } returns NetworkResult.Failure(ApiError(message = "non"))
        val vm = viewModel()
        vm.beginEdit("c1")
        vm.onDraftChange("Hola!")
        vm.submit()

        assertThat(vm.state.value.comments.first().content).isEqualTo("Hola")
        assertThat(vm.state.value.notice).isEqualTo(CommentNotice.EDIT_FAILED)
    }

    @Test
    fun `the cross of the banner returns to creation and clears the text`() = runTest {
        val vm = viewModel()
        vm.beginEdit("c1")
        vm.cancelEdit()
        assertThat(vm.state.value.editing).isNull()
        assertThat(vm.state.value.draft).isEmpty()
        assertThat(vm.state.value.effects.flags).isEqualTo(0L)
    }

    @Test
    fun `the echo reconfirms the edited row without inserting a second one`() = runTest {
        coEvery { repository.updateComment(any(), any(), any(), any(), any()) } returns NetworkResult.Success(mine.copy(content = "Hola!"))
        val vm = viewModel()
        vm.beginEdit("c1")
        vm.onDraftChange("Hola!")
        vm.submit()
        commentUpdated.tryEmit(SocketCommentUpdatedData(postId = "p1", comment = mine.copy(content = "Hola!")))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("c1", "c2").inOrder()
        assertThat(vm.state.value.comments.first().content).isEqualTo("Hola!")
    }

    @Test
    fun `a blank edit without media cannot be sent`() = runTest {
        val vm = viewModel()
        vm.beginEdit("c2")
        vm.onDraftChange("")
        assertThat(vm.state.value.canSubmit).isFalse()
    }
}
