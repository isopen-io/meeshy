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
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Un vocal pris dans le composeur universel, réglé pour un commentaire (#14265), part comme pièce du commentaire. */
@OptIn(ExperimentalCoroutinesApi::class)
class CommentVoiceAttachmentTest {

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: PostRepository = mockk(relaxed = true)
    private val uploader: CommentMediaUploader = mockk(relaxed = true)

    private fun viewModel(): PostCommentsViewModel {
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
        return PostCommentsViewModel(
            repository, session, socket, MeeshyConfig(), search, SavedStateHandle(mapOf("postId" to "p1")), mediaUploader = uploader,
        )
    }

    @Test fun `un vocal joint au commentaire se téléverse puis part avec son id, même sans texte`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(emptyList())
        coEvery { uploader.upload(any()) } returns NetworkResult.Success(listOf(UploadedMedia("v1", "https://x/v1.m4a", "audio/mp4", 2, null, null, 12_000, null)))
        coEvery { repository.addComment("p1", "", any(), any(), any(), any(), listOf("v1")) } returns
            NetworkResult.Success(ApiPostComment(id = "real", content = ""))
        val vm = viewModel()

        vm.attachMedia(MediaUploadItem(byteArrayOf(1, 2), "voice.m4a", "audio/mp4"))

        assertThat(vm.state.value.attachments.pieces.single().isAudio).isTrue()
        assertThat(vm.state.value.canSubmit).isTrue()
        vm.submit()
        coVerify(exactly = 1) { repository.addComment("p1", "", null, null, any(), any(), listOf("v1")) }
    }
}
