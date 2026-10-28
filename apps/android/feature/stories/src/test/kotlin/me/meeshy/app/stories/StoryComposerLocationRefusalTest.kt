package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Un média dont le lieu ne peut pas être retiré (#13550) n'est pas gardé derrière un espace réservé que la file renverrait
 * en boucle : le composeur le DIT et laisse l'auteur choisir un autre fichier. Les codes réels du nettoyeur, pas un double.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerLocationRefusalTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val session: SessionRepository = mockk(relaxed = true)
    private val media: StoryMediaUploader = mockk(relaxed = true)
    private val queue: MediaUploadQueue = mockk(relaxed = true)

    private fun viewModel(): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, media, queue, mockk<WorkManager>(relaxed = true),
            InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true), mockk<StoryDraftConfirmation>(relaxed = true),
        )
    }

    private fun refusal(code: String) = NetworkResult.Failure(ApiError("location", code = code))

    @Test
    fun `a pick refused for its location is told, never queued, and nothing is attached`() = runTest {
        listOf("MEDIA_LOCATION_NOT_REMOVABLE", "IMAGE_LOCATION_NOT_REMOVABLE").forEach { code ->
            val vm = viewModel()
            coEvery { media.upload(any(), any()) } returns refusal(code)

            vm.onMediaPicked(listOf(MediaUploadItem(byteArrayOf(1), "song.ogg", "audio/ogg")))

            assertThat(vm.state.value.errorMessage).isEqualTo(StoryComposerUploadReducer.LOCATION_REFUSED)
            assertThat(vm.state.value.isUploadingMedia).isFalse()
            assertThat(vm.state.value.uploadingMedia).isEmpty()
            assertThat(vm.state.value.draft.mediaIds).isEmpty()
        }
        coVerify(exactly = 0) { queue.enqueue(any(), any()) }
    }

    @Test
    fun `another refusal is still kept on the device to be sent later`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } returns NetworkResult.Failure(ApiError("too large", httpStatus = 413))
        coEvery { queue.enqueue(any(), any()) } returns "cmid_kept"

        vm.onMediaPicked(listOf(MediaUploadItem(byteArrayOf(1), "a.jpg", "image/jpeg")))

        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.draft.mediaIds).containsExactly("cmid_kept")
    }
}
