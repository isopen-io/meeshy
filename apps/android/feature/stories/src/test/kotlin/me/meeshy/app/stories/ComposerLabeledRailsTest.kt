package me.meeshy.app.stories

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.unit.LayoutDirection
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
import me.meeshy.sdk.model.composer.ComposerMoreEntry
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
 * Grand écran (#13837, maquette du 2026-10-30) : quand la place libre à côté de la scène 9:16 pleine hauteur accueille deux
 * rails, le compositeur range ses outils dans un rail gauche libellé (ce qu'on ajoute) et les actions de la sélection dans un
 * rail droit (vide sans sélection, ↶↷ au pied) ; Publier se pose sous la scène. Le téléphone tenu droit garde les
 * surimpressions, et la bascule ne perd rien de la scène.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w1300dp-h1000dp")
class ComposerLabeledRailsTest {

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

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also { it.onEnterComposer() }
    }

    private fun show(vm: StoryComposerViewModel, width: () -> Dp, height: () -> Dp, rtl: Boolean = false) {
        compose.setContent {
            MeeshyTheme {
                val direction = if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr
                CompositionLocalProvider(LocalLayoutDirection provides direction) {
                    Box(Modifier.size(width = width(), height = height())) {
                        val state by vm.state.collectAsState()
                        var sheet by remember { mutableStateOf<StoryComposerSheet?>(null) }
                        StoryComposerSceneFirst(
                            state = state,
                            viewModel = vm,
                            sceneExport = SceneExportHost(SceneCapture(rememberGraphicsLayer(), SceneCapturePass.NONE), emptyList(), false) {},
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

    private fun showTablet(vm: StoryComposerViewModel, rtl: Boolean = false) = show(vm, { 1280.dp }, { 752.dp }, rtl)

    private fun text(label: String): DpRect = compose.onNodeWithText(label).getUnclippedBoundsInRoot()

    private fun scene(): DpRect = compose.onNodeWithContentDescription(canvas).getUnclippedBoundsInRoot()

    @Test
    fun `a tablet held sideways ranges the tools in a labelled rail left of the scene, publish under it`() {
        showTablet(viewModel())

        val scene = scene()
        listOf("Close", "Text", "Media", "Sticker", "Sound", "Drawing", "Background").forEach { label ->
            val item = text(label)
            assertThat(item.right).isAtMost(scene.left)
        }
        compose.onNodeWithContentDescription("More options").assertDoesNotExist()
        assertThat(compose.onNodeWithContentDescription("Publish story").getUnclippedBoundsInRoot().top).isAtLeast(scene.bottom)
    }

    @Test
    fun `each labelled rail entry is a 48 dp target`() {
        showTablet(viewModel())

        listOf("Close", "Text", "Media", "Background").forEach { label ->
            compose.onNodeWithText(label, useUnmergedTree = false).assertHeightIsAtLeast(48.dp)
        }
    }

    @Test
    fun `the more entries that fit are laid in the rail, the rest goes to more`() {
        showTablet(viewModel())

        compose.onNodeWithText("Add slide").assertExists()
    }

    @Test
    fun `the right rail is empty without a selection, then carries the labelled actions of the selection`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onSceneBackgroundTap()
        showTablet(vm)

        compose.onNodeWithText("SELECTION").assertDoesNotExist()
        compose.onNodeWithText("Edit").assertDoesNotExist()

        compose.onNodeWithContentDescription("😀").performClick()

        compose.onNodeWithContentDescription("😀").assertIsSelected()
        val scene = scene()
        listOf("SELECTION", "Edit", "Duplicate", "Remove").forEach { label -> assertThat(text(label).left).isAtLeast(scene.right) }
        compose.onNodeWithTag(SELECTION_BAR_TAG).assertDoesNotExist()
        compose.onNodeWithText("Text").assertExists()
    }

    @Test
    fun `undo and redo sit at the foot of the right rail`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onSceneBackgroundTap()
        showTablet(vm)

        val undo = compose.onNodeWithContentDescription("Undo").getUnclippedBoundsInRoot()
        assertThat(undo.left).isAtLeast(scene().right)
        assertThat(undo.bottom.value).isGreaterThan(752f * 0.8f)
    }

    @Test
    fun `a phone held upright keeps the round tools on the scene and lays no rail`() {
        show(viewModel(), { 360.dp }, { 692.dp })

        compose.onNodeWithContentDescription("Text").assertExists()
        compose.onNodeWithText("Background").assertDoesNotExist()
    }

    @Test
    fun `in a right to left language the rail of what one adds stands on the right`() {
        showTablet(viewModel(), rtl = true)

        assertThat(text("Text").left).isAtLeast(scene().right)
    }

    @Test
    fun `turning the device swaps the arrangement and keeps the selection`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onSceneBackgroundTap()
        var wide by mutableStateOf(false)
        show(vm, { if (wide) 1280.dp else 360.dp }, { if (wide) 752.dp else 692.dp })
        compose.onNodeWithContentDescription("😀").performClick()
        compose.onNodeWithTag(SELECTION_BAR_TAG).assertExists()

        wide = true
        compose.waitForIdle()

        compose.onNodeWithText("SELECTION").assertExists()
        compose.onNodeWithContentDescription("😀").assertIsSelected()

        wide = false
        compose.waitForIdle()

        compose.onNodeWithTag(SELECTION_BAR_TAG).assertExists()
        compose.onNodeWithText("SELECTION").assertDoesNotExist()
    }

    @Test
    fun `the scene stays the same node when the arrangement swaps, its own state survives`() {
        var wide by mutableStateOf(false)
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = if (wide) 1280.dp else 360.dp, height = if (wide) 752.dp else 692.dp)) {
                    StorySceneFirstLayout(
                        onDismiss = {},
                        reduced = false,
                        scene = { modifier ->
                            var taps by remember { mutableIntStateOf(0) }
                            Box(modifier.testTag(SCENE).clickable { taps++ }) { Text("taps $taps") }
                        },
                        top = {},
                        trailing = {},
                        panel = {},
                        socle = {},
                        rails = StorySceneRails(leading = { Text(RAIL) }, trailing = {}, socle = {}, below = {}),
                    )
                }
            }
        }
        compose.onNodeWithTag(SCENE).performClick()
        compose.onNodeWithText(RAIL).assertDoesNotExist()

        wide = true
        compose.waitForIdle()

        compose.onNodeWithText(RAIL).assertExists()
        compose.onNodeWithText("taps 1").assertExists()
    }

    @Test
    fun `the left rail hands the entries it cannot hold to more`() {
        var picked: ComposerMoreEntry? = null
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 112.dp, height = 300.dp)) {
                    StoryLeadingRail(
                        rail = LeadingRailModel(
                            showsClose = true,
                            showsTools = true,
                            activeTool = null,
                            openEntry = null,
                            moreEntries = listOf(ComposerMoreEntry.BACKGROUND, ComposerMoreEntry.ADD_SLIDE, ComposerMoreEntry.CAPTION),
                            animated = false,
                            exportEnabled = true,
                        ),
                        railHeight = 300.dp,
                        onClose = {},
                        onTool = {},
                        onEntry = { picked = it },
                    )
                }
            }
        }

        compose.onNodeWithText("Add slide").assertDoesNotExist()
        compose.onNodeWithText("More").performScrollTo().performClick()
        compose.onNodeWithText("Add slide").performClick()
        assertThat(picked).isEqualTo(ComposerMoreEntry.ADD_SLIDE)
    }

    @Test
    fun `a rail action is read by its label alone, never announced as not selected`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onSceneBackgroundTap()
        showTablet(vm)
        compose.onNodeWithContentDescription("😀").performClick()

        listOf("Close", "Edit", "Duplicate", "Remove", "Add slide").forEach { label ->
            compose.onNodeWithText(label).assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
        }
    }

    @Test
    fun `the entry whose panel is open is highlighted in the rail`() {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 112.dp, height = 900.dp)) {
                    StoryLeadingRail(
                        rail = LeadingRailModel(
                            showsClose = true,
                            showsTools = true,
                            activeTool = null,
                            openEntry = ComposerMoreEntry.SLIDE_DURATION,
                            moreEntries = listOf(ComposerMoreEntry.BACKGROUND, ComposerMoreEntry.SLIDE_DURATION, ComposerMoreEntry.CAPTION),
                            animated = false,
                            exportEnabled = true,
                        ),
                        railHeight = 900.dp,
                        onClose = {},
                        onTool = {},
                        onEntry = {},
                    )
                }
            }
        }

        compose.onNodeWithText("Slide duration").assertIsSelected()
        compose.onNodeWithText("Background").assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
    }

    private companion object {
        const val SCENE = "scene"
        const val RAIL = "rail"
    }
}
