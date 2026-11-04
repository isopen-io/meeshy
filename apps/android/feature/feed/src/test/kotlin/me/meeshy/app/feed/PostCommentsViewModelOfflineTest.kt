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
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.mention.MentionContext
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.outbox.CommentPayload
import me.meeshy.sdk.post.InMemoryCommentDraftStorage
import me.meeshy.sdk.post.CommentDraftStore
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.post.UnsentComment
import me.meeshy.sdk.post.UnsentComments
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.ui.component.comments.CommentUnsentState
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PostCommentsViewModelOfflineTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val commentAdded = MutableSharedFlow<SocketCommentAddedData>(extraBufferCapacity = 64)
    private val queue = MutableStateFlow<List<UnsentComment>>(emptyList())
    private val unsent: UnsentComments = mockk(relaxed = true)

    private object NoMentions : MentionSearch {
        override suspend fun search(query: String): List<MentionCandidate> = emptyList()
        override suspend fun suggest(query: String, context: MentionContext?): List<MentionCandidate> = emptyList()
    }

    private fun viewModel(
        online: Boolean = false,
        drafts: CommentDraftStore? = null,
        served: List<ApiPostComment> = emptyList(),
    ): PostCommentsViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        every { socialSocket.commentAdded } returns commentAdded
        every { socialSocket.commentUpdated } returns MutableSharedFlow()
        every { socialSocket.commentDeleted } returns MutableSharedFlow()
        every { socialSocket.commentReactionAdded } returns MutableSharedFlow()
        every { socialSocket.commentReactionRemoved } returns MutableSharedFlow()
        every { socialSocket.commentTranslationUpdated } returns MutableSharedFlow()
        every { unsent.observe("p1") } returns queue
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(served)
        return PostCommentsViewModel(
            repository, session, socialSocket, MeeshyConfig(), NoMentions,
            SavedStateHandle(mapOf("postId" to "p1")),
            network = InMemoryNetworkMonitor(initialOnline = online),
            unsentQueue = unsent,
            commentDrafts = drafts,
        )
    }

    private fun waiting(cmid: String, text: String = "Salut", parentId: String? = null, failed: Boolean = false) =
        UnsentComment(cmid, "p1", CommentPayload(text, parentId = parentId), 1L, failed, null, null)

    @Test
    fun `hors ligne un commentaire entre dans la file et vide le brouillon`() = runTest {
        coEvery { repository.queueComment(any(), any(), any(), any(), any(), any(), any()) } returns "cmid_1"
        val vm = viewModel()

        vm.onDraftChange("Salut")
        vm.submit()

        coVerify { repository.queueComment("p1", "Salut", null, any(), any(), any(), any()) }
        coVerify(exactly = 0) { repository.addComment(any(), any(), any(), any(), any(), any(), any(), any()) }
        assertThat(vm.state.value.draft).isEmpty()
    }

    @Test
    fun `une ligne de la file apparait dans le fil avec l etat en attente`() = runTest {
        val vm = viewModel()

        queue.value = listOf(waiting("cmid_1"))

        assertThat(vm.state.value.comments.map { it.id }).contains("cmid_1")
        assertThat(vm.outbox!!.states.value["cmid_1"]).isEqualTo(CommentUnsentState.Pending)
    }

    @Test
    fun `l echo comment added remplace la ligne optimiste sans la doubler`() = runTest {
        val vm = viewModel()
        queue.value = listOf(waiting("cmid_1"))

        commentAdded.tryEmit(
            SocketCommentAddedData("p1", ApiPostComment(id = "665f1c2e8b3a4d0012345678", content = "Salut"), clientMutationId = "cmid_1"),
        )

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("665f1c2e8b3a4d0012345678")
    }

    @Test
    fun `un commentaire annule quitte le fil`() = runTest {
        val vm = viewModel()
        queue.value = listOf(waiting("cmid_1"))

        queue.value = emptyList()

        assertThat(vm.state.value.comments).isEmpty()
    }

    @Test
    fun `le renoncement de la file previent l auteur et garde la ligne marquee`() = runTest {
        val vm = viewModel()
        queue.value = listOf(waiting("cmid_1"))

        queue.value = listOf(waiting("cmid_1", failed = true))

        assertThat(vm.state.value.notice).isEqualTo(CommentNotice.SEND_FAILED)
        assertThat(vm.outbox!!.states.value["cmid_1"]).isEqualTo(CommentUnsentState.Failed())
        assertThat(vm.state.value.comments.map { it.id }).contains("cmid_1")
    }

    @Test
    fun `une reponse en file ouvre le fil de son parent et en incremente le compteur`() = runTest {
        // Le parent est à l'écran : on ne répond qu'à un commentaire affiché, et le fil d'un parent absent n'a pas de ligne.
        val vm = viewModel(served = listOf(ApiPostComment(id = "root", content = "Question", replyCount = 1)))
        queue.value = listOf(waiting("cmid_2", parentId = "root"))

        assertThat(vm.state.value.replyThreads["root"]?.replies.orEmpty().map { it.id }).contains("cmid_2")
        assertThat(vm.state.value.comments.single { it.id == "root" }.replyCount).isEqualTo(2)
    }

    @Test
    fun `le brouillon du post revient a la reouverture`() = runTest {
        val drafts = CommentDraftStore(InMemoryCommentDraftStorage(), this, debounceMs = 400L)
        drafts.save("p1", "a reprendre")

        val vm = viewModel(drafts = drafts)

        assertThat(vm.state.value.draft).isEqualTo("a reprendre")
    }

    @Test
    fun `envoyer efface le brouillon du post`() = runTest {
        val drafts = CommentDraftStore(InMemoryCommentDraftStorage(), this, debounceMs = 400L)
        coEvery { repository.queueComment(any(), any(), any(), any(), any(), any(), any()) } returns "cmid_1"
        val vm = viewModel(drafts = drafts)
        vm.onDraftChange("Salut")

        vm.submit()

        assertThat(drafts.load("p1")).isNull()
    }
}
