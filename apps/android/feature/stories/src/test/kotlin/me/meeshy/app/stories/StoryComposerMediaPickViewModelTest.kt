package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * R5 de #13863 : un choix de média se lit sur la scène pendant qu'il se prépare et s'envoie, s'annule d'un ✕ qui libère
 * tout dans la même image, et un échec retire l'espace réservé en offrant « Réessayer » — les octets choisis sont gardés
 * pour ce nouvel essai, et rendus dès qu'il n'a plus lieu. Hors ligne, rien ne bloque : le média attend sa file.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerMediaPickViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @get:Rule
    val folder = TemporaryFolder()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val session: SessionRepository = mockk(relaxed = true)
    private val media: StoryMediaUploader = mockk<StoryMediaUploader>(relaxed = true).also { it.answersEachFromWhole() }
    private val queue: MediaUploadQueue = mockk(relaxed = true)

    private fun viewModel(network: NetworkMonitor? = null): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, media, queue,
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), network = network,
        )
    }

    private fun onDisk(name: String): Pair<MediaUploadItem, File> {
        val dir = File(folder.root, MediaIntake.DIRECTORY).apply { mkdirs() }
        val file = File(dir, name).apply { writeBytes(byteArrayOf(1, 2, 3)) }
        return MediaUploadItem.onDisk(file, name, "image/jpeg") to file
    }

    private fun uploaded(id: String) = UploadedMedia(id, "https://cdn/$id", "image/jpeg", 1, 1, 1, null, null)

    @Test
    fun `while the pick is under way its placeholder stands on the scene and a second pick is refused`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } coAnswers { CompletableDeferred<Unit>().await(); NetworkResult.Success(emptyList()) }

        vm.onMediaPicked(listOf(onDisk("a.jpg").first))
        vm.onMediaPicked(listOf(onDisk("b.jpg").first))

        assertThat(vm.state.value.incomingPlaceholder()).isNotNull()
        assertThat(vm.state.value.incomingMedia.map { it.fileName }).containsExactly("a.jpg")
        assertThat(vm.state.value.canPublish).isFalse()
    }

    @Test
    fun `the cross cancels the pick and frees everything in the same frame, the chosen bytes released`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } coAnswers { CompletableDeferred<Unit>().await(); NetworkResult.Success(emptyList()) }
        val (item, file) = onDisk("a.jpg")
        vm.onMediaPicked(listOf(item))

        vm.onCancelMediaPick()

        val state = vm.state.value
        assertThat(state.isUploadingMedia).isFalse()
        assertThat(state.incomingPlaceholder()).isNull()
        assertThat(state.deck.selectedSlide.mediaIds).isEmpty()
        assertThat(state.errorMessage).isNull()
        assertThat(state.canRetryMedia).isFalse()
        assertThat(file.exists()).isFalse()
    }

    @Test
    fun `a failure removes the placeholder, says so, and keeps the bytes for a retry that lands the media`() = runTest {
        val vm = viewModel()
        var attempts = 0
        coEvery { media.upload(any(), any()) } coAnswers {
            attempts++
            if (attempts == 1) throw IllegalStateException("boom") else NetworkResult.Success(listOf(uploaded("m1")))
        }
        val (item, file) = onDisk("a.jpg")
        vm.onMediaPicked(listOf(item))

        assertThat(vm.state.value.incomingPlaceholder()).isNull()
        assertThat(vm.state.value.errorMessage).isEqualTo(StoryComposerViewModel.MEDIA_FAILED)
        assertThat(vm.state.value.canRetryMedia).isTrue()
        assertThat(file.exists()).isTrue()

        vm.onRetryMediaPick()

        assertThat(vm.state.value.selectedSlideBackdropMediaId).isEqualTo("m1")
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.canRetryMedia).isFalse()
        assertThat(file.exists()).isFalse()
    }

    @Test
    fun `a new pick after a failure gives up the retry and releases its bytes`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } throws IllegalStateException("boom")
        val (first, file) = onDisk("a.jpg")
        vm.onMediaPicked(listOf(first))

        coEvery { media.upload(any(), any()) } returns NetworkResult.Success(listOf(uploaded("m2")))
        vm.onMediaPicked(listOf(onDisk("b.jpg").first))

        assertThat(file.exists()).isFalse()
        assertThat(vm.state.value.canRetryMedia).isFalse()
        assertThat(vm.state.value.selectedSlideBackdropMediaId).isEqualTo("m2")
    }

    @Test
    fun `a media whose location cannot be removed offers no retry, the same bytes would be refused again`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } returns NetworkResult.Failure(ApiError(message = "no", code = "IMAGE_LOCATION_NOT_REMOVABLE"))

        vm.onMediaPicked(listOf(onDisk("a.jpg").first))

        assertThat(vm.state.value.canRetryMedia).isFalse()
    }

    @Test
    fun `offline the media waits on the scene and nothing is blocked`() = runTest {
        val vm = viewModel(network = InMemoryNetworkMonitor(initialOnline = false))
        coEvery { media.upload(any(), any()) } returns NetworkResult.Failure(ApiError(message = "offline"))
        coEvery { queue.enqueue(any(), any(), any()) } returns "cmid_1"

        vm.onMediaPicked(listOf(onDisk("a.jpg").first))

        val state = vm.state.value
        assertThat(state.isUploadingMedia).isFalse()
        assertThat(state.incomingPlaceholder()).isNull()
        assertThat(state.selectedSlidePending.map { it.cmid }).containsExactly("cmid_1")
        assertThat(state.canRetryMedia).isFalse()
    }
}
