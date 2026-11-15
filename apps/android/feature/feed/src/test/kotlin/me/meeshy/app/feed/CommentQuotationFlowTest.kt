package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.CommentQuotedMedia
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.CommentQuotationStore
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/** « Commenter ce média » (#6578) : la citation du post part avec le commentaire, puis s'efface ; une pièce refusée avertit. */
@OptIn(ExperimentalCoroutinesApi::class)
class CommentQuotationFlowTest {

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: PostRepository = mockk(relaxed = true)
    private val quotations = CommentQuotationStore()
    private val uploader: CommentMediaUploader = mockk(relaxed = true)
    private val citation = CommentQuotedMedia("pm1", CommentQuotedMedia.Kind.IMAGE)

    private fun viewModel(postId: String = "p1"): PostCommentsViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        val socket: SocialSocketManager = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        every { socket.commentAdded } returns MutableSharedFlow()
        every { socket.commentUpdated } returns MutableSharedFlow()
        every { socket.commentDeleted } returns MutableSharedFlow()
        every { socket.commentReactionAdded } returns MutableSharedFlow()
        every { socket.commentReactionRemoved } returns MutableSharedFlow()
        every { socket.commentTranslationUpdated } returns MutableSharedFlow()
        val search: MentionSearch = mockk(relaxed = true)
        coEvery { repository.getComments(any(), any(), any()) } returns NetworkResult.Success(emptyList())
        coEvery { uploader.upload(any()) } coAnswers { awaitCancellation() }
        return PostCommentsViewModel(
            repository, session, socket, MeeshyConfig(), search, SavedStateHandle(mapOf("postId" to postId)), mediaUploader = uploader, commentQuotations = quotations,
        )
    }

    @Test fun `la citation du post part avec le commentaire puis s efface`() = runTest {
        coEvery { repository.addComment(any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Success(ApiPostComment(id = "real", content = "Superbe"))
        val vm = viewModel()
        quotations.designate(citation, "p1")
        vm.onDraftChange("Superbe")

        vm.submit()

        coVerify(exactly = 1) { repository.addComment("p1", "Superbe", null, null, any(), any(), any(), any(), "pm1") }
        assertThat(quotations.quotation("p1")).isNull()
    }

    @Test fun `la citation d un autre post ne part pas`() = runTest {
        coEvery { repository.addComment(any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Success(ApiPostComment(id = "real", content = "Salut"))
        val vm = viewModel()
        quotations.designate(citation, "autre")
        vm.onDraftChange("Salut")

        vm.submit()

        coVerify(exactly = 1) { repository.addComment("p1", "Salut", null, null, any(), any(), any(), any(), null) }
        assertThat(quotations.quotation("autre")).isNotNull()
    }

    @Test fun `la croix de la puce retire la citation`() = runTest {
        val vm = viewModel()
        quotations.designate(citation, "p1")
        vm.removeQuotation()
        assertThat(quotations.quotation("p1")).isNull()
    }

    @Test fun `un fichier sans type ni nom est refuse a la pose avec un avertissement`() = runTest {
        val vm = viewModel()
        val warnings = mutableListOf<Unit>()
        val job = launch(UnconfinedTestDispatcher(testScheduler)) { vm.attachmentRefusals.collect { warnings += it } }

        vm.attachMedia(MediaUploadItem(byteArrayOf(1), " ", ""))

        assertThat(vm.state.value.attachments.pieces).isEmpty()
        assertThat(vm.state.value.notice).isEqualTo(CommentNotice.MEDIA_FAILED)
        assertThat(warnings).hasSize(1)
        job.cancel()
    }

    @Test fun `le plafond du serveur refuse la onzieme piece`() = runTest {
        val vm = viewModel()
        repeat(10) { vm.attachMedia(MediaUploadItem(byteArrayOf(1), "p$it.jpg", "image/jpeg")) }
        vm.attachMedia(MediaUploadItem(byteArrayOf(1), "trop.jpg", "image/jpeg"))
        assertThat(vm.state.value.attachments.pieces).hasSize(10)
    }
}
