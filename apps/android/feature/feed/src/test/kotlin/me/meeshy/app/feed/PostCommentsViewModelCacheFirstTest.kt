package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
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
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.KeyedJsonDocument
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.model.SocketCommentReactionUpdateData
import me.meeshy.sdk.model.SocketCommentTranslationUpdatedData
import me.meeshy.sdk.model.SocketCommentUpdatedData
import me.meeshy.sdk.model.mention.MentionContext
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.CommentCacheSource
import me.meeshy.sdk.post.PostCommentsEngine
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PostCommentsViewModelCacheFirstTest {
    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val now = 10_000_000_000L
    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)

    private class Disk(var doc: KeyedJsonDocument<List<ApiPostComment>>?) : CommentCacheSource {
        val kept = mutableListOf<List<ApiPostComment>>()
        override suspend fun read(postId: String) = doc
        override fun keep(postId: String, comments: List<ApiPostComment>, ticket: AccountTicket?) { kept += comments }
    }

    private object NoMentions : MentionSearch {
        override suspend fun search(query: String): List<MentionCandidate> = emptyList()
        override suspend fun suggest(query: String, context: MentionContext?): List<MentionCandidate> = emptyList()
    }

    private fun row(id: String) = ApiPostComment(id = id, content = id)

    private fun viewModel(disk: Disk): PostCommentsViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        every { socialSocket.commentAdded } returns MutableSharedFlow<SocketCommentAddedData>()
        every { socialSocket.commentUpdated } returns MutableSharedFlow<SocketCommentUpdatedData>()
        every { socialSocket.commentDeleted } returns MutableSharedFlow<SocketCommentDeletedData>()
        every { socialSocket.commentReactionAdded } returns MutableSharedFlow<SocketCommentReactionUpdateData>()
        every { socialSocket.commentReactionRemoved } returns MutableSharedFlow<SocketCommentReactionUpdateData>()
        every { socialSocket.commentTranslationUpdated } returns MutableSharedFlow<SocketCommentTranslationUpdatedData>()
        val engine = PostCommentsEngine(disk, { null }, object : CacheClock { override fun nowMillis() = now })
        return PostCommentsViewModel(
            repository, session, socialSocket, MeeshyConfig(), NoMentions,
            SavedStateHandle(mapOf("postId" to "p1")),
            commentsEngine = engine,
        )
    }

    @Test
    fun `rouvrir un post sert ses commentaires depuis le disque avant la reponse du reseau`() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<ApiPostComment>>>()
        coEvery { repository.getComments("p1", null, any()) } coAnswers { gate.await() }

        val vm = viewModel(Disk(KeyedJsonDocument(listOf(row("a"), row("b")), fetchedAt = now - 10 * 60_000)))

        val state = vm.state.value
        assertThat(state.comments.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(state.showSkeleton).isFalse()
        gate.complete(NetworkResult.Success(listOf(row("a"), row("b"), row("c"))))
        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `un cache frais est servi sans relecture`() = runTest {
        val vm = viewModel(Disk(KeyedJsonDocument(listOf(row("a")), fetchedAt = now - 20_000)))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a")
        coVerify(exactly = 0) { repository.getComments(any(), any(), any()) }
    }

    @Test
    fun `une panne reseau ne vide pas un fil servi depuis le disque`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Failure(me.meeshy.sdk.net.ApiError("offline"))

        val vm = viewModel(Disk(KeyedJsonDocument(listOf(row("a")), fetchedAt = now - 10 * 60_000)))

        assertThat(vm.state.value.comments.map { it.id }).containsExactly("a")
        assertThat(vm.state.value.loadFailed).isFalse()
    }

    @Test
    fun `le fil lu sur le reseau est confie au disque`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(row("x")))
        val disk = Disk(null)

        viewModel(disk)

        assertThat(disk.kept.last().map { it.id }).containsExactly("x")
    }
}
