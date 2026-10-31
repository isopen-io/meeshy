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
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerSelectionSubject
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Le fond média suit la grammaire d'édition (#13973) : toucher ou tenir le fond peint le sélectionne, toucher la scène
 * quand quelque chose est sélectionné ressort de tout ; Mettre sur la scène en fait un objet posé, sélectionné ; Retirer
 * l'ôte de la diapo (↶ le ramène) ; Remplacer ne retire l'ancien fond qu'une fois le nouveau arrivé.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryBackgroundSelectionTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val media: StoryMediaUploader = mockk<StoryMediaUploader>(relaxed = true).also { it.answersEachFromWhole() }
    private val uploadQueue: MediaUploadQueue = mockk(relaxed = true)

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "en"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, media, uploadQueue, mockk<WorkManager>(relaxed = true),
            InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true), mockk<StoryDraftConfirmation>(relaxed = true),
        )
    }

    private fun item() = MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = "pic.jpg", mimeType = "image/jpeg")

    private fun uploaded(id: String) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = "image/jpeg", fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)

    private fun StoryComposerViewModel.pick(id: String, asBackground: Boolean = false, replacing: String? = null) {
        coEvery { media.upload(any(), any()) } returns NetworkResult.Success(listOf(uploaded(id)))
        onMediaPicked(listOf(item()), asBackground = asBackground, replacing = replacing)
    }

    private val StoryComposerViewModel.slide get() = state.value.deck.selectedSlide

    @Test
    fun `touching the painted background selects it, and touching the scene again leaves it`() = runTest {
        val vm = viewModel()
        vm.pick("bg")

        vm.onSceneTap()
        assertThat(vm.state.value.selectedSceneObject).isEqualTo(SceneObjectRef(ComposerObjectKind.MEDIA, "bg"))
        assertThat(vm.state.value.selectionSubject).isEqualTo(ComposerSelectionSubject.BACKGROUND)

        vm.onSceneTap()
        assertThat(vm.state.value.selectedSceneObject).isNull()
    }

    @Test
    fun `touching the scene while an object is selected only leaves the object, never selects the background`() = runTest {
        val vm = viewModel()
        vm.pick("bg")
        vm.onAddSticker("😀")

        vm.onSceneTap()

        assertThat(vm.state.value.selectedSceneObject).isNull()
    }

    @Test
    fun `a scene without background media has nothing to select`() = runTest {
        val vm = viewModel()

        vm.onSelectBackground()
        vm.onSceneTap()

        assertThat(vm.state.value.selectedSceneObject).isNull()
    }

    @Test
    fun `holding the background selects it even over a selected object`() = runTest {
        val vm = viewModel()
        vm.pick("bg")
        vm.onAddSticker("😀")

        vm.onSelectBackground()

        assertThat(vm.state.value.selectionSubject).isEqualTo(ComposerSelectionSubject.BACKGROUND)
    }

    @Test
    fun `placing the background on the scene makes it a placed object, selected, and undo brings the background back`() = runTest {
        val vm = viewModel()
        vm.pick("first")
        vm.pick("bg", asBackground = true)
        vm.onSelectBackground()
        val before = vm.slide

        vm.onPutBackgroundOnScene()

        assertThat(vm.slide.backgroundMediaId).isNull()
        assertThat(vm.slide.placedMedia.map { it.mediaId }).contains("bg")
        assertThat(vm.state.value.selectionSubject).isEqualTo(ComposerSelectionSubject.OBJECT)
        assertThat(vm.state.value.deck.selectedSlide.mediaFileOf(vm.state.value.selectedSceneObject!!.id)).isEqualTo("bg")

        vm.onUndo()
        assertThat(vm.slide).isEqualTo(before)
    }

    @Test
    fun `an undesignated painted background is placed on the scene too`() = runTest {
        val vm = viewModel()
        vm.pick("bg")
        vm.onSelectBackground()

        vm.onPutBackgroundOnScene()

        assertThat(vm.slide.placedMedia.map { it.mediaId }).containsExactly("bg")
        assertThat(vm.state.value.selectionSubject).isEqualTo(ComposerSelectionSubject.OBJECT)
    }

    @Test
    fun `removing the selected background takes it off the slide and leaves the editing, undo brings it back`() = runTest {
        val vm = viewModel()
        vm.pick("bg")
        vm.onSelectBackground()

        vm.onRemoveSelectedBackground()

        assertThat(vm.slide.mediaIds).doesNotContain("bg")
        assertThat(vm.state.value.selectedSceneObject).isNull()
        vm.onUndo()
        assertThat(vm.slide.mediaIds).contains("bg")
    }

    @Test
    fun `a replaced background leaves the slide once its successor is painted, and the selection follows`() = runTest {
        val vm = viewModel()
        vm.pick("old")
        vm.onSelectBackground()

        vm.pick("new", asBackground = true, replacing = "old")

        assertThat(vm.slide.mediaIds).containsExactly("new")
        assertThat(vm.slide.backgroundMediaId).isEqualTo("new")
        assertThat(vm.state.value.attachments.map { it.id }).containsExactly("new")
        assertThat(vm.state.value.selectedSceneObject).isEqualTo(SceneObjectRef(ComposerObjectKind.MEDIA, "new"))
    }

    @Test
    fun `choosing a background without replacing keeps the former media, as the overflow always did`() = runTest {
        val vm = viewModel()
        vm.pick("old")

        vm.pick("new", asBackground = true)

        assertThat(vm.slide.mediaIds).containsExactly("old", "new").inOrder()
    }

    @Test
    fun `a replaced background still placed on the scene elsewhere stays on the slide`() = runTest {
        val state = StoryComposerUiState().let { s ->
            val slide = s.deck.selectedSlide
            s.copy(deck = s.deck.copy(slides = listOf(slide.copy(mediaIds = listOf("old", "new"), backgroundMediaId = "new", placedMedia = listOf(StoryPlacedMedia("old"))))))
        }

        assertThat(StoryComposerBackgroundSelectionReducer.retired(state, "old")).isEqualTo(state)
    }
}
