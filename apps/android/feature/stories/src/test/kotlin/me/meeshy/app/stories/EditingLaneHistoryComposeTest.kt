package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
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
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14197 — recette S8 : un objet posé sélectionné, la scène se réduit pour céder un couloir à ses options, et ↶ ↷ restaient
 * en haut à droite, ↶ mordant sur le bord droit de la scène réduite. En édition, ↶ ↷ se rangent dans ce couloir, au pied
 * des options, qui gardent la place des outils : aucun contrôle ne recouvre plus la scène, et l'historique reste à portée.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class EditingLaneHistoryComposeTest {

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

    private val canvas = "Story canvas — pinch to zoom, drag to pan"

    private fun density(): Float = ApplicationProvider.getApplicationContext<android.content.Context>().resources.displayMetrics.density

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also { it.onEnterComposer() }
    }

    private fun show(vm: StoryComposerViewModel) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides true) {
                    Box(Modifier.size(width = 360.dp, height = 692.dp)) {
                        val state by vm.state.collectAsState()
                        var sheet by remember { mutableStateOf<StoryComposerSheet?>(null) }
                        StoryComposerSceneFirst(
                            state = state,
                            viewModel = vm,
                            sceneExport = SceneExportHost(emptyList(), false) {},
                            doors = StoryComposerDoors(onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = {}),
                            morePanel = null,
                            onMorePanel = {},
                            formatChevron = null,
                            sheet = StorySheetSlot(open = sheet, onDismiss = { sheet = null }, onOpen = { sheet = it }) {},
                            keyboard = FixedTypingKeyboard(280f),
                        )
                    }
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `an edited object's undo and redo sit in the lane the reduced scene cleared, never over the scene`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onAddSticker("🔥")
        vm.onUndo()
        vm.onSelectSticker(vm.state.value.deck.selectedSlide.stickers.single().id)
        show(vm)
        compose.onNodeWithTag(EDITING_RAIL_TAG).assertExists()

        val scene = compose.onNodeWithContentDescription(canvas).fetchSemanticsNode().boundsInRoot
        val rail = compose.onNodeWithTag(EDITING_RAIL_TAG).fetchSemanticsNode().boundsInRoot
        assertThat(scene.width).isLessThan(360f * density())
        listOf("Undo", "Redo").forEach { label ->
            val button = compose.onNodeWithContentDescription(label).fetchSemanticsNode().boundsInRoot
            assertThat(button.left).isAtLeast(scene.right)
            assertThat(button.top).isAtLeast(rail.bottom)
        }
    }

    @Test
    fun `undo in the lane still undoes`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        show(vm)

        compose.onNodeWithContentDescription("Undo").performClick()
        compose.waitForIdle()

        assertThat(vm.state.value.deck.selectedSlide.stickers).isEmpty()
    }

    @Test
    fun `at rest undo and redo stay at the top of the scene`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onSceneBackgroundTap()
        show(vm)

        val scene = compose.onNodeWithContentDescription(canvas).getUnclippedBoundsInRoot()
        val undo = compose.onNodeWithContentDescription("Undo").getUnclippedBoundsInRoot()
        val text = compose.onNodeWithContentDescription("Text").getUnclippedBoundsInRoot()
        assertThat(undo.bottom).isAtMost(text.top)
        assertThat(undo.right).isAtMost(scene.right)
    }
}
