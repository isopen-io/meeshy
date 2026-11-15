package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.model.SocketCommentReactionAggregation
import me.meeshy.sdk.model.SocketCommentReactionUpdateData
import me.meeshy.sdk.model.SocketCommentTranslationUpdatedData
import me.meeshy.sdk.model.SocketCommentUpdatedData
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentPage
import me.meeshy.sdk.model.StoryCommentStatus
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostModerationRepository
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryCommentsRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryCommentsViewModelTest {

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: StoryCommentsRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socket: SocialSocketManager = mockk(relaxed = true)
    private val moderation: PostModerationRepository = mockk()
    private val reports: ReportRepository = mockk()
    private val added = MutableSharedFlow<SocketCommentAddedData>(extraBufferCapacity = 16)
    private val updated = MutableSharedFlow<SocketCommentUpdatedData>(extraBufferCapacity = 16)
    private val deleted = MutableSharedFlow<SocketCommentDeletedData>(extraBufferCapacity = 16)
    private val reactionAdded = MutableSharedFlow<SocketCommentReactionUpdateData>(extraBufferCapacity = 16)
    private val reactionRemoved = MutableSharedFlow<SocketCommentReactionUpdateData>(extraBufferCapacity = 16)
    private val translated = MutableSharedFlow<SocketCommentTranslationUpdatedData>(extraBufferCapacity = 16)

    init {
        coEvery { repository.cachedRoots(any(), any()) } returns null
    }

    private fun row(id: String, parentId: String? = null, replyCount: Int = 0) = StoryComment(
        id = id, clientId = null, authorName = "A", avatarUrl = null, content = "c$id", isTranslated = false,
        createdAt = null, status = StoryCommentStatus.Sent, parentId = parentId, replyCount = replyCount,
    )

    private fun page(vararg rows: StoryComment, next: String? = null) = StoryCommentPage(rows.toList(), next, next != null)

    private fun api(id: String, parentId: String? = null) = ApiPostComment(id = id, content = "c$id", parentId = parentId)

    private fun viewModel(): StoryCommentsViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        every { socket.commentAdded } returns added
        every { socket.commentUpdated } returns updated
        every { socket.commentDeleted } returns deleted
        every { socket.commentReactionAdded } returns reactionAdded
        every { socket.commentReactionRemoved } returns reactionRemoved
        every { socket.commentTranslationUpdated } returns translated
        return StoryCommentsViewModel(repository, session, socket, moderation, reports)
    }

    private fun StoryCommentsViewModel.ids() = state.value.comments.roots.map { it.id }

    @Test
    fun `la liste locale est servie d'abord et le reseau la revalide sans spinner`() = runTest {
        coEvery { repository.cachedRoots("s1", any()) } returns page(row("old"))
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("old"), row("new")))
        val vm = viewModel()

        vm.begin("s1", payloadCount = 1)

        assertThat(vm.ids()).containsExactly("old", "new").inOrder()
        assertThat(vm.state.value.isLoadingRoots).isFalse()
        assertThat(vm.state.value.comments.count).isEqualTo(2)
    }

    @Test
    fun `un cache vide attend le reseau avec un squelette`() = runTest {
        coEvery { repository.cachedRoots("s1", any()) } returns null
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Failure(ApiError("hors ligne"))
        val vm = viewModel()

        vm.begin("s1")

        assertThat(vm.state.value.isLoadingRoots).isFalse()
        assertThat(vm.state.value.isOffline).isTrue()
        assertThat(vm.ids()).isEmpty()
    }

    @Test
    fun `une panne reseau garde la liste locale`() = runTest {
        coEvery { repository.cachedRoots("s1", any()) } returns page(row("old"))
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Failure(ApiError("hors ligne"))
        val vm = viewModel()

        vm.begin("s1")

        assertThat(vm.ids()).containsExactly("old")
    }

    @Test
    fun `deplier un fil recharge sa premiere page et voir plus la suivante`() = runTest {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r", replyCount = 30)))
        coEvery { repository.replies("s1", "r", null, any(), any()) } returns NetworkResult.Success(page(row("a", "r"), next = "a"))
        coEvery { repository.replies("s1", "r", "a", any(), any()) } returns NetworkResult.Success(page(row("b", "r")))
        val vm = viewModel()
        vm.begin("s1")

        vm.toggleThread("r")
        vm.loadMoreReplies("r")

        assertThat(vm.state.value.comments.repliesOf("r").map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(vm.state.value.comments.thread.isExpanded("r")).isTrue()
        assertThat(vm.state.value.comments.thread.hasMoreReplies("r")).isFalse()
    }

    @Test
    fun `le coeur est optimiste puis rejoue en arriere si le serveur refuse`() = runTest {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r")))
        coEvery { repository.like("s1", "r") } returns NetworkResult.Failure(ApiError("non"))
        val vm = viewModel()
        vm.begin("s1")

        vm.toggleLike("r")

        val after = vm.state.value.comments.find("r")!!
        assertThat(after.likedByMe).isFalse()
        assertThat(after.likeCount).isEqualTo(0)
        assertThat(vm.state.value.comments.likesInFlight).isEmpty()
    }

    @Test
    fun `le coeur accepte reste pose`() = runTest {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r")))
        coEvery { repository.like("s1", "r") } returns NetworkResult.Success(Unit)
        val vm = viewModel()
        vm.begin("s1")

        vm.toggleLike("r")

        assertThat(vm.state.value.comments.find("r")!!.likedByMe).isTrue()
        coVerify(exactly = 1) { repository.like("s1", "r") }
    }

    @Test
    fun `les sockets ajoutent, remplacent et retirent en place pour la story a l'ecran seulement`() = runTest {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r")))
        val vm = viewModel()
        vm.begin("s1")

        added.emit(SocketCommentAddedData("s1", api("n"), commentCount = 2))
        added.emit(SocketCommentAddedData("autre", api("x"), commentCount = 9))
        assertThat(vm.ids()).containsExactly("r", "n").inOrder()
        assertThat(vm.state.value.comments.count).isEqualTo(2)

        updated.emit(SocketCommentUpdatedData("s1", ApiPostComment(id = "n", content = "edite")))
        assertThat(vm.state.value.comments.find("n")!!.content).isEqualTo("edite")

        deleted.emit(SocketCommentDeletedData("s1", "n", commentCount = 1))
        assertThat(vm.ids()).containsExactly("r")
    }

    @Test
    fun `un agregat de coeur du socket fixe le compte`() = runTest {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r")))
        val vm = viewModel()
        vm.begin("s1")

        reactionAdded.emit(
            SocketCommentReactionUpdateData("r", "s1", "me", "❤️", aggregation = SocketCommentReactionAggregation("❤️", 4)),
        )

        assertThat(vm.state.value.comments.find("r")!!.likeCount).isEqualTo(4)
        assertThat(vm.state.value.comments.find("r")!!.likedByMe).isTrue()
    }

    @Test
    fun `une traduction arrivee par socket est rangee dans la ligne`() = runTest {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r")))
        val vm = viewModel()
        vm.begin("s1")

        translated.emit(SocketCommentTranslationUpdatedData("s1", "r", "en", ApiPostTranslationEntry(text = "hello")))

        assertThat(vm.state.value.comments.find("r")!!.translations).containsKey("en")
    }

    @Test
    fun `la chasse trouve une reponse a la page deux de son fil et deplie le parent`() = runTest {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r", replyCount = 30)))
        coEvery { repository.replies("s1", "r", null, any(), any()) } returns NetworkResult.Success(page(row("a", "r"), next = "a"))
        coEvery { repository.replies("s1", "r", "a", any(), any()) } returns NetworkResult.Success(page(row("goal", "r")))
        val vm = viewModel()
        vm.begin("s1")

        vm.huntTarget("goal", parentId = "r")

        assertThat(vm.state.value.targetFound).isTrue()
        assertThat(vm.state.value.comments.thread.isExpanded("r")).isTrue()
        assertThat(vm.state.value.comments.contains("goal")).isTrue()
    }

    @Test
    fun `la chasse d'un commentaire disparu l'annonce introuvable`() = runTest {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r")))
        val vm = viewModel()
        vm.begin("s1")

        vm.huntTarget("ghost", parentId = null)

        assertThat(vm.state.value.targetFound).isFalse()
    }

    @Test
    fun `changer de story quitte la salle de la precedente`() = runTest {
        coEvery { repository.roots(any(), any(), any(), any()) } returns NetworkResult.Success(page())
        val vm = viewModel()

        vm.begin("s1")
        vm.begin("s2")

        verify { socket.leavePostRoom("s1") }
        verify { socket.joinPostRoom("s2") }
    }

    @Test
    fun `la suppression retire la ligne apres la confirmation du serveur`() = runTest {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r")))
        coEvery { repository.delete("s1", "r") } returns NetworkResult.Success(Unit)
        val vm = viewModel()
        vm.begin("s1")

        vm.delete("r")

        assertThat(vm.ids()).isEmpty()
    }

    @Test
    fun `l'edition remplace le texte de la ligne`() = runTest {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r")))
        coEvery { repository.edit("s1", "r", "neuf", any()) } returns NetworkResult.Success(row("r").copy(content = "neuf"))
        val vm = viewModel()
        vm.begin("s1")

        vm.edit("r", "neuf")

        assertThat(vm.state.value.comments.find("r")!!.content).isEqualTo("neuf")
    }

    @Test
    fun `une edition refusee COMMENTS_DISABLED garde le texte d'origine et ferme le fil`() = runTest {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r")))
        coEvery { repository.edit("s1", "r", "neuf", any()) } returns
            NetworkResult.Failure(ApiError(message = "Comments are disabled", code = "COMMENTS_DISABLED", httpStatus = 403))
        val vm = viewModel()
        vm.begin("s1")
        var closed = 0

        vm.edit("r", "neuf") { closed++ }

        assertThat(vm.state.value.comments.find("r")!!.content).isEqualTo("cr")
        assertThat(closed).isEqualTo(1)
    }

    @Test
    fun `une autre panne d'edition ne ferme pas le fil`() = runTest {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r")))
        coEvery { repository.edit("s1", "r", "neuf", any()) } returns NetworkResult.Failure(ApiError(message = "boom", code = "INTERNAL_ERROR"))
        val vm = viewModel()
        vm.begin("s1")
        var closed = 0

        vm.edit("r", "neuf") { closed++ }

        assertThat(closed).isEqualTo(0)
    }

    private fun loadedViewModel(): StoryCommentsViewModel {
        coEvery { repository.roots("s1", null, any(), any()) } returns NetworkResult.Success(page(row("r"), row("q")))
        val vm = viewModel()
        vm.begin("s1")
        return vm
    }

    @Test
    fun `a moderation removal drops the row at once and keeps it gone when the gateway agrees`() = runTest {
        coEvery { moderation.removeComment("s1", "r", "spam abusif") } returns NetworkResult.Success(Unit)
        val vm = loadedViewModel()

        vm.remove("r", "  spam abusif ")

        assertThat(vm.ids()).containsExactly("q")
        coVerify { moderation.removeComment("s1", "r", "spam abusif") }
    }

    @Test
    fun `a refused removal brings the row back`() = runTest {
        coEvery { moderation.removeComment("s1", "r", any()) } returns NetworkResult.Failure(ApiError("non"))
        val vm = loadedViewModel()

        vm.remove("r", "spam abusif")

        assertThat(vm.ids()).containsExactly("r", "q").inOrder()
    }

    @Test
    fun `a reason out of bounds sends nothing`() = runTest {
        val vm = loadedViewModel()

        vm.remove("r", "ab")

        assertThat(vm.ids()).containsExactly("r", "q").inOrder()
    }

    @Test
    fun `reply target is exposed then cleared`() = runTest {
        val vm = loadedViewModel()

        vm.setReplyTarget(row("r"))
        assertThat(vm.state.value.replyTarget?.id).isEqualTo("r")
        vm.clearReplyTarget()
        assertThat(vm.state.value.replyTarget).isNull()
    }

    @Test
    fun `the viewer is read from the session when a story begins`() = runTest {
        val vm = loadedViewModel()

        assertThat(vm.state.value.viewerId).isEqualTo("me")
    }
}
