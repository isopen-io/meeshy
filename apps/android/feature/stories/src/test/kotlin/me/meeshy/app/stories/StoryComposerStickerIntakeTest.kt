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
 * #15597 : un sticker image dont les octets s'envoient entre dans la scène comme un média (R5 de #13863, iOS
 * `beginSceneIntake(.sticker, …)`) — son espace réservé se tient à sa place, le reste de l'écran attend, un second ajout
 * est refusé, ✕ l'annule, et un échec libère l'écran en proposant « Réessayer » qui renvoie le même sticker.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerStickerIntakeTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val session: SessionRepository = mockk(relaxed = true)
    private val media: StoryMediaUploader = mockk<StoryMediaUploader>(relaxed = true).also { it.answersEachFromWhole() }

    private fun viewModel(): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, media, mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true),
        )
    }

    private val png = MediaUploadItem(byteArrayOf(1, 2), "sticker.png", "image/png")

    private fun pose() = StickerImagePose(provider = "pack", emoji = "👋", preview = "https://packs/hi.png", produce = { png })

    private fun served() = NetworkResult.Success(listOf(UploadedMedia("pm-1", "https://cdn/pm-1.png", "image/png", 2, 1, 1, null, null)))

    private fun StoryComposerViewModel.stickers() = state.value.deck.selectedSlide.stickers

    @Test
    fun `a sticker on its way holds its place on the scene and the rest of the screen waits`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } coAnswers { CompletableDeferred<Unit>().await(); served() }

        vm.onAddImageSticker(pose())

        val state = vm.state.value
        val placeholder = state.incomingSticker()
        assertThat(placeholder).isNotNull()
        assertThat(placeholder?.stickerId).isEqualTo(vm.stickers().single().id)
        assertThat(state.intakeBlocks).isTrue()
        assertThat(state.canPublish).isFalse()
    }

    @Test
    fun `while a sticker is on its way a second addition is refused`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } coAnswers { CompletableDeferred<Unit>().await(); served() }
        vm.onAddImageSticker(pose())

        vm.onAddImageSticker(pose())
        vm.onAddSticker("😀")
        vm.onMediaPicked(listOf(MediaUploadItem(byteArrayOf(3), "a.jpg", "image/jpeg")))

        assertThat(vm.stickers()).hasSize(1)
        assertThat(vm.state.value.deck.selectedSlide.mediaIds).isEmpty()
    }

    @Test
    fun `the cross cancels the sticker and frees the screen in the same frame`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } coAnswers { CompletableDeferred<Unit>().await(); served() }
        vm.onAddImageSticker(pose())

        vm.onCancelStickerIntake()

        val state = vm.state.value
        assertThat(state.incomingSticker()).isNull()
        assertThat(state.intakeBlocks).isFalse()
        assertThat(vm.stickers()).isEmpty()
        assertThat(state.errorMessage).isNull()
    }

    @Test
    fun `once its bytes arrive the sticker is a sticker like any other and the screen is free`() = runTest {
        val vm = viewModel()
        val gate = CompletableDeferred<Unit>()
        coEvery { media.upload(any(), any()) } coAnswers { gate.await(); served() }
        vm.onAddImageSticker(pose())

        gate.complete(Unit)

        assertThat(vm.state.value.incomingSticker()).isNull()
        assertThat(vm.state.value.intakeBlocks).isFalse()
        assertThat(vm.stickers().single().postMediaId).isEqualTo("pm-1")
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `a failure frees the screen, says so and offers a retry that poses the same sticker`() = runTest {
        val vm = viewModel()
        var attempts = 0
        coEvery { media.upload(any(), any()) } coAnswers {
            attempts++
            if (attempts == 1) NetworkResult.Failure(ApiError("boom", httpStatus = 500)) else served()
        }

        vm.onAddImageSticker(pose())

        assertThat(vm.stickers()).isEmpty()
        assertThat(vm.state.value.intakeBlocks).isFalse()
        assertThat(vm.state.value.errorMessage).isEqualTo(StoryComposerViewModel.STICKER_IMAGE_FAILED)
        assertThat(vm.state.value.canRetrySticker).isTrue()

        vm.onRetryStickerIntake()

        val sticker = vm.stickers().single()
        assertThat(sticker.postMediaId).isEqualTo("pm-1")
        assertThat(sticker.provider).isEqualTo("pack")
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.canRetrySticker).isFalse()
    }

    @Test
    fun `dismissing a failed sticker gives up its retry`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } returns NetworkResult.Failure(ApiError("boom", httpStatus = 500))
        vm.onAddImageSticker(pose())

        vm.onCancelStickerIntake()

        assertThat(vm.state.value.canRetrySticker).isFalse()
        assertThat(vm.state.value.errorMessage).isNull()
        vm.onRetryStickerIntake()
        assertThat(vm.stickers()).isEmpty()
    }
}
