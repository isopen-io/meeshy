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

@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerStickerPoseTest {

    private val dispatcher = UnconfinedTestDispatcher()

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

    private val png = MediaUploadItem(byteArrayOf(1, 2), "sticker.png", "image/png")

    private fun pose(produce: suspend () -> MediaUploadItem? = { png }) =
        StickerImagePose(provider = "mee", emoji = "👋", preview = "file:///cache/mee.png", produce = produce)

    private fun StoryComposerViewModel.sticker() = state.value.deck.selectedSlide.stickers.single()

    @Test
    fun `un cadre a mots se pose avec ses mots, son repli et son mouvement, et part tel quel`() {
        val vm = viewModel()

        vm.onAddTemplateSticker("text.neon", mapOf("text" to "Salut"))

        val wire = vm.sticker().toSticker()
        assertThat(wire.templateId).isEqualTo("text.neon")
        assertThat(wire.slots).containsExactly("text", "Salut")
        assertThat(wire.emoji).isEqualTo("💡")
        assertThat(wire.animation).isEqualTo("blink")
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `un gabarit inconnu ne pose rien`() {
        val vm = viewModel()

        vm.onAddTemplateSticker("weather.sun", emptyMap())

        assertThat(vm.state.value.deck.selectedSlide.stickers).isEmpty()
    }

    @Test
    fun `un sticker image se voit tout de suite, ne publie qu'une fois ses octets arrives, et part avec son media`() = runTest {
        val vm = viewModel()
        val gate = CompletableDeferred<Unit>()
        coEvery { media.upload(any(), any()) } coAnswers {
            gate.await()
            NetworkResult.Success(listOf(UploadedMedia("pm-1", "https://cdn/pm-1.png", "image/png", 2, 1, 1, null, null)))
        }

        vm.onAddImageSticker(pose())

        assertThat(vm.sticker().imageUrl).isEqualTo("file:///cache/mee.png")
        assertThat(vm.state.value.canPublish).isFalse()
        gate.complete(Unit)
        val wire = vm.sticker().toSticker()
        assertThat(wire.postMediaId).isEqualTo("pm-1")
        assertThat(wire.provider).isEqualTo("mee")
        assertThat(wire.emoji).isEqualTo("👋")
        assertThat(vm.sticker().imageUrl).isEqualTo("https://cdn/pm-1.png")
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `un sticker image pose est UN pas d'annulation`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } returns
            NetworkResult.Success(listOf(UploadedMedia("pm-1", "https://cdn/pm-1.png", "image/png", 2, 1, 1, null, null)))

        vm.onAddImageSticker(pose())
        vm.onUndo()

        assertThat(vm.state.value.deck.selectedSlide.stickers).isEmpty()
    }

    @Test
    fun `un envoi refuse retire le sticker et le dit`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } returns NetworkResult.Failure(ApiError("boom", httpStatus = 500))

        vm.onAddImageSticker(pose())

        assertThat(vm.state.value.deck.selectedSlide.stickers).isEmpty()
        assertThat(vm.state.value.errorMessage).isEqualTo(StoryComposerViewModel.STICKER_IMAGE_FAILED)
    }

    @Test
    fun `une image illisible retire le sticker sans rien envoyer`() = runTest {
        val vm = viewModel()

        vm.onAddImageSticker(pose(produce = { null }))

        assertThat(vm.state.value.deck.selectedSlide.stickers).isEmpty()
        assertThat(vm.state.value.errorMessage).isEqualTo(StoryComposerViewModel.STICKER_IMAGE_FAILED)
    }

    @Test
    fun `le brouillon garde un sticker a gabarit ou image arrive, jamais une image en cours d'envoi`() = runTest {
        val vm = viewModel()
        val gate = CompletableDeferred<Unit>()
        coEvery { media.upload(any(), any()) } coAnswers {
            gate.await()
            NetworkResult.Success(listOf(UploadedMedia("pm-1", "https://cdn/pm-1.png", "image/png", 2, 1, 1, null, null)))
        }
        vm.onAddTemplateSticker("time.digital", mapOf("time" to "14:07", "hour" to "14", "minute" to "07"))
        vm.onAddImageSticker(pose())

        val pending = vm.state.value.deck.toDraftSnapshot(visibility = me.meeshy.sdk.model.StoryVisibility.PUBLIC, repostOfId = null, nowIso = "now")
        assertThat(pending.toDeck()!!.selectedSlide.stickers.map { it.templateId }).containsExactly("time.digital")

        gate.complete(Unit)
        val restored = vm.state.value.deck.toDraftSnapshot(visibility = me.meeshy.sdk.model.StoryVisibility.PUBLIC, repostOfId = null, nowIso = "now")
            .toDeck()!!.selectedSlide.stickers
        assertThat(restored.map { it.slots["time"] }).containsExactly("14:07", null).inOrder()
        assertThat(restored.last().postMediaId).isEqualTo("pm-1")
        assertThat(restored.last().provider).isEqualTo("mee")
        assertThat(restored.last().imageUrl).isEqualTo("https://cdn/pm-1.png")
    }

    @Test
    fun `une image en cours d'envoi retient la publication meme quand la scene porte deja autre chose`() = runTest {
        val vm = viewModel()
        val gate = CompletableDeferred<Unit>()
        coEvery { media.upload(any(), any()) } coAnswers {
            gate.await()
            NetworkResult.Success(listOf(UploadedMedia("pm-1", "https://cdn/pm-1.png", "image/png", 2, 1, 1, null, null)))
        }
        vm.onAddSticker("🔥")

        vm.onAddImageSticker(pose())

        assertThat(vm.state.value.canPublish).isFalse()
        gate.complete(Unit)
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `annuler le geste fait pendant l'envoi garde l'image arrivee au lieu de la figer en attente`() = runTest {
        val vm = viewModel()
        val gate = CompletableDeferred<Unit>()
        coEvery { media.upload(any(), any()) } coAnswers {
            gate.await()
            NetworkResult.Success(listOf(UploadedMedia("pm-1", "https://cdn/pm-1.png", "image/png", 2, 1, 1, null, null)))
        }
        vm.onAddImageSticker(pose())
        vm.onAddSticker("🔥")
        gate.complete(Unit)

        vm.onUndo()

        val image = vm.sticker()
        assertThat(image.postMediaId).isEqualTo("pm-1")
        assertThat(image.isAwaitingImage).isFalse()
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `une image refusee ne revient jamais par l'annulation`() = runTest {
        val vm = viewModel()
        val gate = CompletableDeferred<Unit>()
        coEvery { media.upload(any(), any()) } coAnswers {
            gate.await()
            NetworkResult.Failure(ApiError("boom", httpStatus = 500))
        }
        vm.onAddImageSticker(pose())
        vm.onAddSticker("🔥")
        gate.complete(Unit)

        vm.onUndo()

        assertThat(vm.state.value.deck.selectedSlide.stickers.none { it.isAwaitingImage }).isTrue()
    }
}
