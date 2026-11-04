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
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.sound.ComposerAudioRole
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

/**
 * #15598 : un son que la feuille a préparé se pose aussitôt, et ses octets partent en arrière-plan (iOS
 * `startPendingPreUploads` après la pose) en disant leur part envoyée. Publier attend ses sons : une piste ne part
 * qu'avec son adresse servie. Un échec garde le son, le dit et propose « Réessayer ».
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerSoundUploadTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @get:Rule
    val folder = TemporaryFolder()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val session: SessionRepository = mockk(relaxed = true)
    private val media: StoryMediaUploader = mockk(relaxed = true)

    private fun viewModel(): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, media, mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true),
        )
    }

    private fun take(): MediaUploadItem {
        val file = folder.newFile("take.m4a").apply { writeBytes(byteArrayOf(1, 2, 3)) }
        return MediaUploadItem.onDisk(file, file.name, "audio/mp4", 2_500)
    }

    private fun sound(item: MediaUploadItem) = ComposedStorySound(
        trackId = "rec-1",
        postMediaId = "",
        url = "file:///cache/take.m4a",
        durationSeconds = 2.5f,
        waveform = listOf(0.5f),
        language = "fr",
        transcription = null,
    )

    private val served = UploadedMedia("pm-sound", "https://cdn/pm-sound.m4a", "audio/mp4", 10, null, null, 2_500, null)

    private fun StoryComposerViewModel.track() = state.value.deck.selectedSlide.audio.single()

    @Test
    fun `a sound is on the scene at once, says how much is sent, and holds publishing until received`() = runTest {
        val vm = viewModel()
        val gate = CompletableDeferred<Unit>()
        coEvery { media.upload(any(), any()) } coAnswers {
            secondArg<(Int, Long, Long) -> Unit>()(0, 1, 4)
            gate.await()
            NetworkResult.Success(listOf(served))
        }
        val item = take()

        vm.onPlaceSendingSound(sound(item), ComposerAudioRole.BACKGROUND, item)

        assertThat(vm.track().id).isEqualTo("rec-1")
        assertThat(vm.state.value.intakeBlocks).isFalse()
        assertThat(vm.state.value.sendingFraction("rec-1")).isWithin(0.001f).of(0.25f)
        assertThat(vm.state.value.canPublish).isFalse()

        gate.complete(Unit)

        assertThat(vm.track().postMediaId).isEqualTo("pm-sound")
        assertThat(vm.track().mediaURL).isEqualTo("https://cdn/pm-sound.m4a")
        assertThat(vm.state.value.uploadProgress).isEmpty()
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `a failed sound stays, says so, and a retry sends it`() = runTest {
        val vm = viewModel()
        var attempts = 0
        coEvery { media.upload(any(), any()) } coAnswers {
            attempts++
            if (attempts == 1) NetworkResult.Failure(ApiError("boom", httpStatus = 500)) else NetworkResult.Success(listOf(served))
        }
        val item = take()

        vm.onPlaceSendingSound(sound(item), ComposerAudioRole.BACKGROUND, item)

        assertThat(vm.track().postMediaId).isEmpty()
        assertThat(vm.state.value.failedSounds).containsExactly("rec-1")
        assertThat(vm.state.value.errorMessage).isEqualTo(StoryComposerViewModel.SOUND_FAILED)
        assertThat(vm.state.value.canPublish).isFalse()

        vm.onRetrySoundUploads()

        assertThat(vm.track().postMediaId).isEqualTo("pm-sound")
        assertThat(vm.state.value.failedSounds).isEmpty()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `undoing past a sound still on its way brings it back received`() = runTest {
        val vm = viewModel()
        val gate = CompletableDeferred<Unit>()
        coEvery { media.upload(any(), any()) } coAnswers { gate.await(); NetworkResult.Success(listOf(served)) }
        val item = take()
        vm.onPlaceSendingSound(sound(item), ComposerAudioRole.BACKGROUND, item)
        vm.onUndo()

        gate.complete(Unit)
        vm.onRedo()

        assertThat(vm.track().postMediaId).isEqualTo("pm-sound")
    }
}
