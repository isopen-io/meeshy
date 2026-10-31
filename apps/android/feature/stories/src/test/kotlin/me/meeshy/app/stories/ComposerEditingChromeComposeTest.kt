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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.click
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onChildren
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
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
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadItem
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
 * Un objet sélectionné met le compositeur en édition (#13956, décision porteur du 2026-10-31) : l'audience, Publier et
 * Fermer se retirent, la colonne des outils porte à la même place Modifier, Dupliquer, Temps et Retirer, une option ouvre
 * ses propriétés en bas, et la désélection — fond touché, OK du panneau — rend tout. TalkBack annonce l'entrée et la sortie.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class ComposerEditingChromeComposeTest {

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
    private val options = listOf("Edit", "Duplicate", "Timing", "Remove")
    private val tools = listOf("Text", "Media", "Sticker", "More options")

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also { it.onEnterComposer() }
    }

    private fun show(vm: StoryComposerViewModel, reduceMotion: Boolean = false) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
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
    }

    private fun withPlacedPhoto(vm: StoryComposerViewModel) {
        val photo = PendingMediaUpload("p", MediaUploadItem(ByteArray(4), "p.jpg", "image/jpeg"))
        vm.onSceneReduce { state ->
            val slide = state.deck.selectedSlide
            state.copy(
                deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) it.copy(mediaIds = listOf("p"), placedMedia = listOf(StoryPlacedMedia("p"))) else it }),
                pendingUploads = listOf(photo),
            )
        }
        vm.onSceneBackgroundTap()
    }

    private fun tapEmptyScene() {
        compose.onNodeWithContentDescription(canvas).performTouchInput { click(Offset(width * 0.15f, height * 0.35f)) }
    }

    private fun assertRestingChrome() {
        compose.onNodeWithContentDescription("Audience").assertExists()
        compose.onNodeWithContentDescription("Publish story").assertExists()
        compose.onNodeWithContentDescription("Close").assertExists()
        tools.forEach { compose.onNodeWithContentDescription(it).assertExists() }
        compose.onNodeWithTag(EDITING_RAIL_TAG).assertDoesNotExist()
    }

    @Test
    fun `a selected placed media hides audience, publish and close, and the rail carries its four options`() {
        val vm = viewModel()
        withPlacedPhoto(vm)
        show(vm)
        val textTool = compose.onNodeWithContentDescription("Text").getUnclippedBoundsInRoot()

        compose.onNodeWithContentDescription("Media on the scene").performClick()

        assertThat(vm.state.value.selectedMedia).isEqualTo("p")
        compose.onNodeWithContentDescription("Audience").assertDoesNotExist()
        compose.onNodeWithContentDescription("Publish story").assertDoesNotExist()
        compose.onNodeWithContentDescription("Close").assertDoesNotExist()
        tools.forEach { compose.onNodeWithContentDescription(it).assertDoesNotExist() }
        val rail = compose.onNodeWithTag(EDITING_RAIL_TAG)
        rail.onChildren().assertCountEquals(options.size)
        options.forEach { compose.onNodeWithText(it).assertExists() }
        compose.onNodeWithText("Order").assertDoesNotExist()
        val edit = compose.onNodeWithText("Edit").getUnclippedBoundsInRoot()
        assertThat(edit.right).isAtLeast(textTool.left)
        assertThat(edit.top).isAtLeast(textTool.top - 8.dp)
        assertThat(edit.top).isAtMost(textTool.bottom)
    }

    @Test
    fun `touching Timing lays its properties at the bottom, the scene reduced above, publish still away`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        show(vm)

        compose.onNodeWithText("Timing").performClick()

        val window = compose.onNodeWithText("From 0.0 s to the end").getUnclippedBoundsInRoot()
        assertThat(window.top.value).isGreaterThan(692f / 2)
        compose.onNodeWithContentDescription("Publish story").assertDoesNotExist()
        compose.onNodeWithContentDescription("Audience").assertDoesNotExist()
    }

    @Test
    fun `touching the empty scene ends the editing and gives back rail, audience, publish and close`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        show(vm)
        compose.onNodeWithTag(EDITING_RAIL_TAG).assertExists()

        tapEmptyScene()

        assertThat(vm.state.value.selectedSceneObject).isNull()
        assertRestingChrome()
    }

    @Test
    fun `OK on the properties panel ends the editing too`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        show(vm)
        compose.onNodeWithText("Timing").performClick()

        val inSheet = compose.onAllNodesWithContentDescription("Close the panel").fetchSemanticsNodes()
            .minBy { it.boundsInRoot.height }
        compose.onNode(SemanticsMatcher("sheet ok") { it.id == inSheet.id }).performSemanticsAction(SemanticsActions.OnClick)
        compose.waitForIdle()

        assertThat(vm.state.value.selectedSceneObject).isNull()
        assertRestingChrome()
    }

    @Test
    fun `talkback hears the editing family on selection and the return to the tools on deselection`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onSceneBackgroundTap()
        show(vm)
        val announcer = compose.onNodeWithTag(EDITING_ANNOUNCER_TAG)
        announcer.assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
        announcer.assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.ContentDescription))

        compose.onNodeWithContentDescription("😀").performClick()
        announcer.assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Editing: Sticker")))

        tapEmptyScene()
        announcer.assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Back to the scene tools")))
    }

    private fun publishCountTwoFramesAfterSelecting(reduceMotion: Boolean): Int {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onSceneBackgroundTap()
        show(vm, reduceMotion = reduceMotion)
        compose.waitForIdle()
        compose.mainClock.autoAdvance = false

        compose.runOnUiThread { vm.onSelectSticker(vm.state.value.deck.selectedSlide.stickers.single().id) }
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()

        return compose.onAllNodesWithContentDescription("Publish story").fetchSemanticsNodes().size
    }

    @Test
    fun `under reduce motion publish leaves at once`() {
        assertThat(publishCountTwoFramesAfterSelecting(reduceMotion = true)).isEqualTo(0)
    }

    @Test
    fun `otherwise publish fades out instead of vanishing`() {
        assertThat(publishCountTwoFramesAfterSelecting(reduceMotion = false)).isEqualTo(1)
    }
}
