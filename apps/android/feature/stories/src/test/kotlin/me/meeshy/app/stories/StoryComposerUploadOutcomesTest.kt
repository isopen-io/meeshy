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
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #13959, recette S8 : une vidéo et une photo choisies ensemble. La vidéo est REÇUE (dernier PATCH 200) ; la photo échoue.
 * Avant : l'échec de la photo renvoyait les DEUX en file, la vidéo restait « En attente » sur la scène et « Hors ligne »
 * dans le panneau, en Wi-Fi, et rien ne relançait. Ici chaque média suit SON issue, « Hors ligne » ne se dit que sans
 * réseau, un média en file repart seul au retour du réseau ou d'un toucher, et reçu, il remplace son espace réservé.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerUploadOutcomesTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val session: SessionRepository = mockk(relaxed = true)
    private val media: StoryMediaUploader = mockk(relaxed = true)
    private val queue: MediaUploadQueue = mockk(relaxed = true)

    private fun viewModel(network: InMemoryNetworkMonitor = InMemoryNetworkMonitor(initialOnline = true)): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        coEvery { queue.enqueue(any(), any(), any()) } returns CMID
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, media, queue,
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), network = network,
        )
    }

    private val video = MediaUploadItem(byteArrayOf(1, 2, 3), "20261031_131911.mp4", "video/mp4")
    private val photo = MediaUploadItem(byteArrayOf(4, 5, 6), "20261031_131908.jpg", "image/jpeg")

    private fun received(id: String, mime: String) = UploadedMedia(id, "https://cdn/$id", mime, 1, 1, 1, null, null)
    private val timedOut = NetworkResult.Failure(ApiError(message = "timeout", code = "NETWORK"))

    private fun StoryComposerViewModel.everyMediaId(): List<String> =
        state.value.deck.slides.flatMap { it.mediaIds + listOfNotNull(it.backgroundMediaId) + it.placedMedia.map(StoryPlacedMedia::mediaId) }

    private fun pickVideoAndPhoto(vm: StoryComposerViewModel) {
        coEvery { media.uploadEach(any(), any()) } returns listOf(NetworkResult.Success(listOf(received("pm-video", "video/mp4"))), timedOut)
        vm.onMediaPicked(listOf(video, photo))
    }

    @Test
    fun `a received video lands at once though the photo picked with it failed, and only the photo waits`() = runTest {
        val vm = viewModel()

        pickVideoAndPhoto(vm)

        val state = vm.state.value
        assertThat(state.attachments.map { it.id }).containsExactly("pm-video")
        assertThat(state.pendingUploads.map { it.cmid }).containsExactly(CMID)
        assertThat(vm.everyMediaId()).containsAtLeast("pm-video", CMID)
        coVerify(exactly = 1) { queue.enqueue(photo, any(), any()) }
        coVerify(exactly = 0) { queue.enqueue(video, any(), any()) }
        assertThat(state.isUploadingMedia).isFalse()
    }

    @Test
    fun `online, a media whose upload failed says it failed and offers a retry, never offline`() = runTest {
        val vm = viewModel()

        pickVideoAndPhoto(vm)

        assertThat(vm.state.value.pendingPhase(CMID)).isEqualTo(PendingUploadPhase.FAILED)
        assertThat(vm.state.value.errorMessage).isEqualTo(StoryComposerViewModel.MEDIA_FAILED)
        assertThat(vm.state.value.canRetryMedia).isTrue()
    }

    @Test
    fun `offline the waiting media says offline, and it leaves by itself once the network is back`() = runTest {
        val network = InMemoryNetworkMonitor(initialOnline = false)
        val vm = viewModel(network)
        pickVideoAndPhoto(vm)
        assertThat(vm.state.value.pendingPhase(CMID)).isEqualTo(PendingUploadPhase.OFFLINE)
        assertThat(vm.state.value.errorMessage).isNull()
        coEvery { media.uploadEach(listOf(photo), any()) } returns listOf(NetworkResult.Success(listOf(received("pm-photo", "image/jpeg"))))

        network.simulateOnline()

        val state = vm.state.value
        assertThat(state.attachments.map { it.id }).containsExactly("pm-video", "pm-photo").inOrder()
        assertThat(state.pendingUploads).isEmpty()
        assertThat(vm.everyMediaId()).doesNotContain(CMID)
        assertThat(vm.everyMediaId()).contains("pm-photo")
        coVerify(exactly = 1) { queue.cancel(CMID) }
    }

    @Test
    fun `touching a failed media sends it again, and once received it replaces its placeholder in every undo step`() = runTest {
        val vm = viewModel()
        pickVideoAndPhoto(vm)
        vm.onAddSticker("🙂")
        coEvery { media.uploadEach(listOf(photo), any()) } returns listOf(NetworkResult.Success(listOf(received("pm-photo", "image/jpeg"))))

        vm.onRetryPendingUpload(CMID)

        assertThat(vm.state.value.pendingUploads).isEmpty()
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.canRetryMedia).isFalse()
        vm.onUndo()
        assertThat(vm.everyMediaId()).doesNotContain(CMID)
        assertThat(vm.everyMediaId()).contains("pm-photo")
        assertThat(vm.state.value.attachments.map { it.id }).containsExactly("pm-video", "pm-photo")
    }

    @Test
    fun `a retry that fails again is said again and stays in the queue, its bytes kept`() = runTest {
        val vm = viewModel()
        pickVideoAndPhoto(vm)
        coEvery { media.uploadEach(listOf(photo), any()) } returns listOf(timedOut)

        vm.onRetryMediaPick()

        assertThat(vm.state.value.pendingPhase(CMID)).isEqualTo(PendingUploadPhase.FAILED)
        assertThat(vm.state.value.pendingUploads.map { it.cmid }).containsExactly(CMID)
        coVerify(exactly = 0) { queue.cancel(CMID) }
    }

    @Test
    fun `while a queued media is sent again it says so, never offline nor failed`() = runTest {
        val vm = viewModel()
        pickVideoAndPhoto(vm)
        val gate = kotlinx.coroutines.CompletableDeferred<List<NetworkResult<List<UploadedMedia>>>>()
        coEvery { media.uploadEach(listOf(photo), any()) } coAnswers { gate.await() }

        vm.onRetryPendingUpload(CMID)

        assertThat(vm.state.value.pendingPhase(CMID)).isEqualTo(PendingUploadPhase.SENDING)
        gate.complete(listOf(NetworkResult.Success(listOf(received("pm-photo", "image/jpeg")))))
        assertThat(vm.state.value.attachments.map { it.id }).contains("pm-photo")
    }

    private companion object {
        const val CMID = "cmid_photo"
    }
}
