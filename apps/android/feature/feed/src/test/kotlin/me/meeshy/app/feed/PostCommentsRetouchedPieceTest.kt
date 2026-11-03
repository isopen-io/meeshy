package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.composer.look.ComposerPhotoLook
import me.meeshy.sdk.model.composer.look.ComposerPhotoRecipe
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.ui.component.retouch.ComposerLookAuthor
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Une pièce de commentaire retouchée garde son original et sa recette jusqu'à son départ (#14844). */
@OptIn(ExperimentalCoroutinesApi::class)
class PostCommentsRetouchedPieceTest {

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: PostRepository = mockk(relaxed = true)
    private val uploader: CommentMediaUploader = mockk(relaxed = true)
    private val author = ComposerLookAuthor("self", "", null, CallMontageCaption(CallMontageCaption.BRAND_TITLE, "3 Nov 2026", "10:42"), "3 Nov 2026")
    private val warm = ComposerPhotoRecipe(look = ComposerPhotoLook(filter = VideoFilterPreset.Warm))

    private fun viewModel(): PostCommentsViewModel {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(emptyList())
        coEvery { uploader.upload(any()) } returnsMany listOf("m1", "m2", "m3").map { id ->
            NetworkResult.Success(listOf(UploadedMedia(id, "https://x/$id.jpg", "image/jpeg", 2, 10, 10, null, null)))
        }
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        val socket: SocialSocketManager = mockk(relaxed = true)
        every { socket.commentAdded } returns MutableSharedFlow()
        every { socket.commentUpdated } returns MutableSharedFlow()
        every { socket.commentDeleted } returns MutableSharedFlow()
        every { socket.commentReactionAdded } returns MutableSharedFlow()
        every { socket.commentReactionRemoved } returns MutableSharedFlow()
        every { socket.commentTranslationUpdated } returns MutableSharedFlow()
        return PostCommentsViewModel(repository, session, socket, MeeshyConfig(), mockk(relaxed = true), SavedStateHandle(mapOf("postId" to "p1")), mediaUploader = uploader)
    }

    @Test
    fun `une piece retouchee deux fois garde son original et sa derniere recette, et seule la cuisson remplacee quitte le disque`() = runTest {
        val intake = File(Files.createTempDirectory("comments").toFile(), MediaIntake.DIRECTORY).apply { mkdirs() }
        fun onDisk(name: String) = MediaUploadItem(MediaUploadSource.OnDisk(File(intake, name).apply { writeBytes(byteArrayOf(1)) }), name, "image/jpeg")
        val vm = viewModel()
        val original = onDisk("a.jpg")
        vm.attachMedia(original)
        val id = vm.state.value.attachments.pieces.single().id
        vm.replaceMedia(id, onDisk("a_retouche_1.jpg"), CommentPieceRetouch(original, warm, author))
        val secondBake = onDisk("a_retouche_2.jpg")
        vm.replaceMedia(id, secondBake, CommentPieceRetouch(original, warm.copy(look = ComposerPhotoLook(filter = VideoFilterPreset.Cool)), author))
        val piece = vm.state.value.attachments.pieces.single()
        assertThat(piece.item).isSameInstanceAs(secondBake)
        assertThat(piece.retouch?.original).isSameInstanceAs(original)
        assertThat(piece.retouch?.recipe?.look?.filter).isEqualTo(VideoFilterPreset.Cool)
        assertThat(vm.state.value.attachments.attachmentIds).containsExactly("m3")
        assertThat(intake.list().orEmpty().toList()).containsExactly("a.jpg", "a_retouche_2.jpg")
        vm.removeMedia(id)
        assertThat(intake.list().orEmpty().toList()).isEmpty()
    }

    @Test
    fun `une piece remise a son original quitte sa recette et sa cuisson`() = runTest {
        val vm = viewModel()
        val original = MediaUploadItem(byteArrayOf(1, 2), "a.jpg", "image/jpeg")
        vm.attachMedia(original)
        val id = vm.state.value.attachments.pieces.single().id
        vm.replaceMedia(id, MediaUploadItem(byteArrayOf(3), "a_retouche.jpg", "image/jpeg"), CommentPieceRetouch(original, warm, author))
        vm.replaceMedia(id, original, null)
        val piece = vm.state.value.attachments.pieces.single()
        assertThat(piece.item).isSameInstanceAs(original)
        assertThat(piece.retouch).isNull()
        assertThat(vm.state.value.attachments.attachmentIds).containsExactly("m3")
    }
}
