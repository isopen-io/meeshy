package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
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
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
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
 * #15598 : un média choisi ne retient l'écran que le temps de sa préparation sur l'appareil (iOS `finishSceneIntake` puis
 * la pose, avant tout envoi). Posé, il s'envoie en arrière-plan avec « Envoi N % » sur lui ; Publier n'attend pas l'envoi
 * (iOS `ComposerPreUploadPolicy.publishReuses`) : la publication reprend ce qui n'a pas fini, par la file durable dont
 * la story dépend — elle ne part donc pas avant que son média soit reçu.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerBackgroundUploadTest {

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
    private val stories: StoryRepository = mockk(relaxed = true)

    private fun viewModel(): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            stories, session, media, queue,
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true),
        )
    }

    private fun onDisk(name: String): Pair<MediaUploadItem, File> {
        val dir = File(folder.root, MediaIntake.DIRECTORY).apply { mkdirs() }
        val file = File(dir, name).apply { writeBytes(byteArrayOf(1, 2, 3)) }
        return MediaUploadItem.onDisk(file, name, "image/jpeg") to file
    }

    private fun uploaded(id: String) = UploadedMedia(id, "https://cdn/$id", "image/jpeg", 1, 1, 1, null, null)

    private fun StoryComposerViewModel.sending(): String = state.value.selectedSlidePending.single().cmid

    @Test
    fun `a picked media lands at once and the screen is free while its bytes go`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } coAnswers { CompletableDeferred<Unit>().await(); NetworkResult.Success(emptyList()) }

        vm.onMediaPicked(listOf(onDisk("a.jpg").first))

        val state = vm.state.value
        assertThat(state.intakeBlocks).isFalse()
        assertThat(state.incomingPlaceholder()).isNull()
        assertThat(state.pendingPhase(vm.sending())).isEqualTo(PendingUploadPhase.SENDING)
        assertThat(state.canPublish).isTrue()
    }

    @Test
    fun `the media on its way says how much of it is sent`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } coAnswers {
            secondArg<(Int, Long, Long) -> Unit>()(0, 40, 100)
            CompletableDeferred<Unit>().await()
            NetworkResult.Success(emptyList())
        }

        vm.onMediaPicked(listOf(onDisk("a.jpg").first))

        assertThat(vm.state.value.sendingFraction(vm.sending())).isWithin(0.001f).of(0.4f)
    }

    @Test
    fun `a second media can be picked while the first is still on its way`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } coAnswers { CompletableDeferred<Unit>().await(); NetworkResult.Success(emptyList()) }

        vm.onMediaPicked(listOf(onDisk("a.jpg").first))
        vm.onMediaPicked(listOf(onDisk("b.jpg").first))

        assertThat(vm.state.value.pendingUploads.map { it.item.fileName }).containsExactly("a.jpg", "b.jpg")
    }

    @Test
    fun `once received the media replaces its placeholder and its local copy is released`() = runTest {
        val vm = viewModel()
        val gate = CompletableDeferred<Unit>()
        coEvery { media.upload(any(), any()) } coAnswers { gate.await(); NetworkResult.Success(listOf(uploaded("m1"))) }
        val (item, file) = onDisk("a.jpg")
        vm.onMediaPicked(listOf(item))

        gate.complete(Unit)

        val state = vm.state.value
        assertThat(state.pendingUploads).isEmpty()
        assertThat(state.selectedSlideBackdropMediaId).isEqualTo("m1")
        assertThat(file.exists()).isFalse()
    }

    @Test
    fun `a failed send waits in the durable queue under the same id and offers a retry`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } returns NetworkResult.Failure(ApiError(message = "boom", httpStatus = 500))
        val (item, _) = onDisk("a.jpg")

        vm.onMediaPicked(listOf(item))

        val cmid = vm.sending()
        coVerify { queue.enqueueAs(cmid, item, TusUploadContext.STORY) }
        assertThat(vm.state.value.pendingPhase(cmid)).isEqualTo(PendingUploadPhase.FAILED)
        assertThat(vm.state.value.canRetryMedia).isTrue()
    }

    @Test
    fun `publishing hands a media still on its way to the durable queue the story waits on`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } coAnswers { CompletableDeferred<Unit>().await(); NetworkResult.Success(emptyList()) }
        val (item, _) = onDisk("a.jpg")
        vm.onMediaPicked(listOf(item))
        val cmid = vm.sending()

        vm.publish()

        coVerifyOrder {
            queue.enqueueAs(cmid, item, TusUploadContext.STORY)
            stories.enqueuePublish(any(), dependsOn = listOf(cmid))
        }
    }

    @Test
    fun `while the chosen files are copied the placeholder holds the screen, and the cross gives everything back`() = runTest {
        val vm = viewModel()
        val copied = CompletableDeferred<List<MediaUploadItem>>()

        vm.onMediaChosen(count = 1) { copied.await() }

        assertThat(vm.state.value.incomingPlaceholder()).isNotNull()
        assertThat(vm.state.value.intakeBlocks).isTrue()
        assertThat(vm.state.value.canPublish).isFalse()

        vm.onCancelMediaPick()
        val (item, file) = onDisk("late.jpg")
        copied.complete(listOf(item))

        assertThat(vm.state.value.intakeBlocks).isFalse()
        assertThat(vm.state.value.pendingUploads).isEmpty()
        assertThat(file.exists()).isFalse()
    }

    @Test
    fun `once copied the media lands and the placeholder lets go of the screen`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } coAnswers { CompletableDeferred<Unit>().await(); NetworkResult.Success(emptyList()) }
        val (item, _) = onDisk("a.jpg")

        vm.onMediaChosen(count = 1) { listOf(item) }

        assertThat(vm.state.value.intakeBlocks).isFalse()
        assertThat(vm.state.value.pendingUploads.map { it.item }).containsExactly(item)
    }
}
