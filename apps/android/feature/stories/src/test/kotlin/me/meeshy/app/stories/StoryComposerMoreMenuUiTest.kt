package me.meeshy.app.stories

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkManager
import coil.Coil
import coil.ImageLoader
import coil.intercept.Interceptor
import coil.request.ErrorResult
import coil.request.ImageResult
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.feature.stories.R
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le « ⋯ » complet et l'appui long sur Média (#13845), à l'écran du téléphone : rien qui n'ait d'effet, « Tout effacer » après
 * confirmation seulement, ↶ qui le défait, l'aperçu qui s'ouvre et se referme, la photothèque ou les fichiers au doigt tenu.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
class StoryComposerMoreMenuUiTest {

    @get:Rule
    val compose = createComposeRule()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        Coil.setImageLoader(ImageLoader.Builder(ApplicationProvider.getApplicationContext()).components { add(NoImages) }.build())
    }

    @After
    fun tearDown() {
        Coil.reset()
        Dispatchers.resetMain()
    }

    private object NoImages : Interceptor {
        override suspend fun intercept(chain: Interceptor.Chain): ImageResult =
            ErrorResult(null, chain.request, IllegalStateException("not loaded in a test"))
    }

    private fun string(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "en"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also { it.onEnterComposer() }
    }

    private fun show(vm: StoryComposerViewModel, doors: StoryComposerDoors = doors()) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 411.dp, height = 891.dp)) {
                    val state by vm.state.collectAsState()
                    var sheet by remember { mutableStateOf<StoryComposerSheet?>(null) }
                    StoryComposerSceneFirst(
                        state = state,
                        viewModel = vm,
                        sceneExport = SceneExportHost(emptyList(), false) {},
                        doors = doors,
                        morePanel = null,
                        onMorePanel = {},
                        formatChevron = null,
                        sheet = StorySheetSlot(open = sheet, onDismiss = { sheet = null }, onOpen = { sheet = it }) {},
                    )
                }
            }
        }
    }

    private fun doors(onPickMedia: () -> Unit = {}, onPickFiles: () -> Unit = {}) = StoryComposerDoors(
        onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = onPickMedia, onOpenSoundShelf = {},
        onPickFiles = onPickFiles,
    )

    private fun openMore() = compose.onNodeWithContentDescription(string(R.string.stories_scene_overflow_menu)).performClick()

    @Test
    fun `a blank composer offers neither the preview nor clear all`() {
        show(viewModel())

        openMore()

        compose.onNodeWithText(string(R.string.composer_more_preview)).assertDoesNotExist()
        compose.onNodeWithText(string(R.string.composer_more_clear_all)).assertDoesNotExist()
        compose.onNodeWithText(string(R.string.composer_more_remove_background)).assertDoesNotExist()
    }

    @Test
    fun `clear all asks first, cancel keeps everything, confirming clears and undo brings it back`() {
        val vm = viewModel()
        vm.onAddSticker("🔥")
        vm.onDeselectSticker()
        show(vm)

        openMore()
        compose.onNodeWithText(string(R.string.composer_more_clear_all)).performClick()
        compose.onNodeWithText(string(R.string.composer_clear_all_title)).assertExists()
        compose.onNodeWithText(string(R.string.composer_clear_all_cancel)).performClick()
        assertThat(vm.state.value.selectedSlideStickers).hasSize(1)

        openMore()
        compose.onNodeWithText(string(R.string.composer_more_clear_all)).performClick()
        compose.waitForIdle()
        compose.onNodeWithText(string(R.string.composer_more_clear_all)).performClick()
        compose.waitForIdle()
        assertThat(vm.state.value.selectedSlideStickers).isEmpty()

        compose.onNodeWithContentDescription(string(R.string.story_composer_undo)).performClick()
        assertThat(vm.state.value.selectedSlideStickers).hasSize(1)
    }

    @Test
    fun `the preview opens over a scene with something to show and closes with its cross`() {
        val vm = viewModel()
        vm.onTextChange("hello")
        show(vm)

        openMore()
        compose.onNodeWithText(string(R.string.composer_more_preview)).performClick()
        compose.onNodeWithContentDescription(string(R.string.composer_preview_close)).performClick()

        compose.onNodeWithContentDescription(string(R.string.composer_preview_close)).assertDoesNotExist()
    }

    @Test
    fun `holding the media tool offers the photo library or the files, and a tap still opens the library alone`() {
        var library = 0
        var files = 0
        show(viewModel(), doors(onPickMedia = { library++ }, onPickFiles = { files++ }))
        val media = compose.onNodeWithContentDescription(string(R.string.story_tool_media))

        media.performTouchInput { longClick() }
        compose.onNodeWithText(string(R.string.composer_media_from_library)).assertExists()
        compose.onNodeWithText(string(R.string.composer_media_from_files)).performClick()

        assertThat(files).isEqualTo(1)
        assertThat(library).isEqualTo(0)

        media.performClick()
        assertThat(library).isEqualTo(1)
    }
}
