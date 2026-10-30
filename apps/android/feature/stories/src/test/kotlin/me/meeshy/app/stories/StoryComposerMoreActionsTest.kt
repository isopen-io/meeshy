package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
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
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.AudienceCandidate
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
 * Le « ⋯ » complet (#13845, miroir de `ComposerOverflowPolicy` / `MeeshyComposerHost+Overflow` iOS) : Aperçu, Choisir un
 * fond, Retirer le fond de la scène, Tout effacer — chacun passe par l'historique, ↶ le défait.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerMoreActionsTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val media: StoryMediaUploader = mockk(relaxed = true)
    private val uploadQueue: MediaUploadQueue = mockk(relaxed = true)

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "en"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true),
            session,
            media,
            uploadQueue,
            mockk<WorkManager>(relaxed = true),
            InMemoryStoryComposerDraftStore(),
            mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true),
        )
    }

    private fun item(name: String = "pic.jpg") = MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = name, mimeType = "image/jpeg")

    private fun uploaded(id: String, mime: String = "image/jpeg") =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = mime, fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)

    private fun StoryComposerViewModel.pick(id: String, asBackground: Boolean = false) {
        coEvery { media.upload(any(), any()) } returns NetworkResult.Success(listOf(uploaded(id)))
        onMediaPicked(listOf(item()), asBackground = asBackground)
    }

    @Test
    fun `clear all leaves one blank slide on the neutral background, then undo brings every slide and media back`() = runTest {
        val vm = viewModel()
        vm.pick("m1")
        vm.onSlideBackgroundChange(StoryBackgroundValue.Hex("FF3399"))
        vm.onAddSticker("🔥")
        vm.onAddSlide()
        vm.onAddTextElement()
        val composed = vm.state.value

        vm.onClearAll()

        val cleared = vm.state.value
        assertThat(cleared.deck.size).isEqualTo(1)
        assertThat(cleared.deck.selectedSlide).isEqualTo(StorySlide(id = cleared.deck.selectedId))
        assertThat(cleared.selectedSlideBackground).isNull()
        assertThat(cleared.attachments).isEmpty()
        assertThat(cleared.selectedTextElementId).isNull()
        assertThat(StoryComposerEraseReducer.hasSomethingToErase(cleared)).isFalse()

        vm.onUndo()

        assertThat(vm.state.value.deck.slides).isEqualTo(composed.deck.slides)
        assertThat(vm.state.value.attachments).isEqualTo(composed.attachments)
    }

    @Test
    fun `clear all also lets go of the people the publication named, as on iOS, so nobody is notified about a story they no longer appear in`() = runTest {
        val vm = viewModel()
        vm.onTextChange("bonjour")
        vm.onAddMention(AudienceCandidate(id = "u1", username = "ana"))
        assertThat(vm.state.value.draft.mentions).isNotEmpty()

        vm.onClearAll()

        assertThat(vm.state.value.draft.mentions).isEmpty()
    }

    @Test
    fun `clear all buries an offline media instead of cancelling it, so undo shows it again`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } returns NetworkResult.Failure(ApiError("offline"))
        coEvery { uploadQueue.enqueue(any(), any()) } returns "cmid_offline"
        vm.onMediaPicked(listOf(item()))
        assertThat(vm.state.value.pendingUploads.map { it.cmid }).containsExactly("cmid_offline")

        vm.onClearAll()
        assertThat(vm.state.value.pendingUploads).isEmpty()

        vm.onUndo()
        assertThat(vm.state.value.pendingUploads.map { it.cmid }).containsExactly("cmid_offline")
        assertThat(vm.state.value.deck.selectedSlide.mediaIds).containsExactly("cmid_offline")
    }

    @Test
    fun `a blank composer has nothing to erase, any slide content or a second slide does`() {
        val blank = StoryComposerUiState()
        assertThat(StoryComposerEraseReducer.hasSomethingToErase(blank)).isFalse()
        assertThat(StoryComposerEraseReducer.hasSomethingToErase(blank.withDeckTransform { it.addSlide("s2") })).isTrue()
        assertThat(StoryComposerEraseReducer.hasSomethingToErase(blank.withDeckTransform { it.setSelectedBackground(StoryBackgroundValue.Hex("112233")) })).isTrue()
    }

    @Test
    fun `remove the background takes the colour and the background media off the scene in one undo step`() = runTest {
        val vm = viewModel()
        vm.onSlideBackgroundChange(StoryBackgroundValue.Hex("FF3399"))
        vm.pick("bg")
        vm.onToggleSlideBackgroundMedia("bg")
        val before = vm.state.value.deck.selectedSlide
        assertThat(StoryComposerEraseReducer.hasBackground(vm.state.value)).isTrue()

        vm.onRemoveSceneBackground()

        val slide = vm.state.value.deck.selectedSlide
        assertThat(slide.background).isNull()
        assertThat(slide.backgroundMediaId).isNull()
        assertThat(slide.mediaIds).doesNotContain("bg")
        assertThat(StoryComposerEraseReducer.hasBackground(vm.state.value)).isFalse()

        vm.onUndo()
        assertThat(vm.state.value.deck.selectedSlide).isEqualTo(before)
    }

    @Test
    fun `a media chosen as the background becomes the designated background of the scene`() = runTest {
        val vm = viewModel()
        vm.pick("placed")

        vm.pick("chosen", asBackground = true)

        assertThat(vm.state.value.deck.selectedSlide.backgroundMediaId).isEqualTo("chosen")
        assertThat(vm.state.value.deck.selectedSlide.mediaIds).containsExactly("placed", "chosen").inOrder()
    }

    @Test
    fun `an offline media chosen as the background is designated under its placeholder`() = runTest {
        val vm = viewModel()
        vm.pick("placed")
        coEvery { media.upload(any(), any()) } returns NetworkResult.Failure(ApiError("offline"))
        coEvery { uploadQueue.enqueue(any(), any()) } returns "cmid_bg"

        vm.onMediaPicked(listOf(item()), asBackground = true)

        assertThat(vm.state.value.deck.selectedSlide.backgroundMediaId).isEqualTo("cmid_bg")
    }

    @Test
    fun `choosing a background is only offered once the media door no longer reaches it`() = runTest {
        val vm = viewModel()
        assertThat(StoryComposerEraseReducer.canPickBackground(vm.state.value)).isFalse()

        vm.pick("m1")

        assertThat(StoryComposerEraseReducer.canPickBackground(vm.state.value)).isTrue()
    }

    @Test
    fun `the preview plays every publishable slide through the reader projection, media included`() = runTest {
        val vm = viewModel()
        vm.onTextChange("bonjour")
        vm.pick("m1")
        vm.onAddSlide()

        val items = StoryComposerPreview.items(vm.state.value, language = "fr")

        assertThat(items).hasSize(1)
        assertThat(items.single().content).isEqualTo("bonjour")
        assertThat(items.single().media.map { it.id }).containsExactly("m1")
        assertThat(items.single().media.single().type).isEqualTo(FeedMediaType.IMAGE)
        val slide = StorySlideProjector(apiBaseUrl = null).project(items.single(), "6366F1", NoContentPreferences)
        assertThat(slide.text).isEqualTo("bonjour")
        assertThat(slide.imageUrl).isEqualTo("https://cdn/m1")
    }

    @Test
    fun `a blank composer has nothing to preview`() {
        assertThat(StoryComposerPreview.items(StoryComposerUiState(), language = "fr")).isEmpty()
    }
}
