package me.meeshy.app.stories

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
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryCommentPublication
import me.meeshy.sdk.story.StoryCommentPublisher
import me.meeshy.sdk.story.StoryCommentsRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryCommentAttachmentsViewModelTest {

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val photo = MediaUploadItem(byteArrayOf(1), "photo.jpg", "image/jpeg")

    private class Rig(publication: StoryCommentPublication, val upload: CompletableDeferred<StoryCommentUpload>) {
        val publisher: StoryCommentPublisher = mockk()
        val uploader: StoryCommentMediaUploader = mockk()
        val drafts = StoryCommentDraftStore()
        val repository: StoryCommentsRepository = mockk(relaxed = true)
        val session: SessionRepository = mockk(relaxed = true)
        val socket: SocialSocketManager = mockk(relaxed = true)

        init {
            coEvery { repository.cachedRoots(any(), any()) } returns null
            coEvery { uploader.upload(any()) } coAnswers { upload.await() }
            coEvery { publisher.publish(any(), any(), any(), any(), any(), any(), any()) } returns publication
            every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
            every { socket.commentAdded } returns MutableSharedFlow()
            every { socket.commentUpdated } returns MutableSharedFlow()
            every { socket.commentDeleted } returns MutableSharedFlow()
            every { socket.commentReactionAdded } returns MutableSharedFlow()
            every { socket.commentReactionRemoved } returns MutableSharedFlow()
            every { socket.commentTranslationUpdated } returns MutableSharedFlow()
        }

        fun viewModel() = StoryCommentsViewModel(
            repository, session, socket, mockk(), mockk<ReportRepository>(), publisher, drafts, null, uploader,
        ).also { it.begin("s1") }
    }

    private fun rig(publication: StoryCommentPublication = StoryCommentPublication.Delivered) =
        Rig(publication, CompletableDeferred())

    @Test
    fun `the comment waits for the upload and leaves with the media id`() = runTest {
        val rig = rig()
        val vm = rig.viewModel()
        vm.attachMedia(photo)

        assertThat(vm.tray.value.isUploading).isTrue()
        assertThat(vm.send("", null)).isFalse()

        rig.upload.complete(StoryCommentUpload.Done("srv-1"))
        assertThat(vm.tray.value.attachmentIds).containsExactly("srv-1")
        assertThat(vm.send("", "fr")).isTrue()

        coVerify(exactly = 1) { rig.publisher.publish("s1", "", null, "fr", listOf("srv-1"), null, null) }
        assertThat(vm.tray.value.hasMedia).isFalse()
    }

    @Test
    fun `a failed upload takes the piece off the tray and says so`() = runTest {
        val rig = rig()
        val vm = rig.viewModel()
        vm.attachMedia(photo)
        rig.upload.complete(StoryCommentUpload.Failed)
        assertThat(vm.tray.value.hasMedia).isFalse()
    }

    @Test
    fun `a piece removed from the tray is not brought back by its late answer`() = runTest {
        val rig = rig()
        val vm = rig.viewModel()
        vm.attachMedia(photo)
        vm.removeMedia(vm.tray.value.pieces.single().id)
        rig.upload.complete(StoryCommentUpload.Done("srv-1"))
        assertThat(vm.tray.value.hasMedia).isFalse()
    }

    @Test
    fun `the tray holds a single media`() = runTest {
        val rig = rig()
        val vm = rig.viewModel()
        vm.attachMedia(photo)
        vm.attachMedia(MediaUploadItem(byteArrayOf(2), "b.jpg", "image/jpeg"))
        assertThat(vm.tray.value.pieces).hasSize(1)
    }

    @Test
    fun `a place alone is a comment and travels with it`() = runTest {
        val rig = rig()
        val vm = rig.viewModel()
        val place = SharedPlace(latitude = 1.0, longitude = 2.0, name = "Ici")
        vm.setPlace(place)
        vm.setEffectFlags(2)
        assertThat(vm.send("", null)).isTrue()
        coVerify(exactly = 1) { rig.publisher.publish("s1", "", null, null, null, 2, place) }
    }

    @Test
    fun `a refused comment comes back with its pieces and its place`() = runTest {
        val rig = rig(StoryCommentPublication.Refused("salut"))
        val vm = rig.viewModel()
        vm.attachMedia(photo)
        rig.upload.complete(StoryCommentUpload.Done("srv-1"))
        val place = SharedPlace(latitude = 1.0, longitude = 2.0)
        vm.setPlace(place)

        vm.send("salut", null)

        assertThat(vm.tray.value.attachmentIds).containsExactly("srv-1")
        assertThat(vm.place.value).isEqualTo(place)
        val draft = rig.drafts.draftOf("s1")!!
        assertThat(draft.text).isEqualTo("salut")
        assertThat(draft.pieces.map { it.uploadedId }).containsExactly("srv-1")
        assertThat(draft.place).isEqualTo(place)
    }

    @Test
    fun `the pieces survive the story draft and reopen with it`() = runTest {
        val rig = rig()
        val vm = rig.viewModel()
        vm.attachMedia(photo)
        rig.upload.complete(StoryCommentUpload.Done("srv-1"))
        vm.saveDraft("brouillon")

        vm.begin("s2")
        assertThat(vm.tray.value.hasMedia).isFalse()
        vm.begin("s1")
        val draft = vm.restoreDraft()

        assertThat(draft?.text).isEqualTo("brouillon")
        assertThat(vm.tray.value.attachmentIds).containsExactly("srv-1")
    }
}
