package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.click
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
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
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadItem
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
 * Le compositeur entier, un élément sélectionné (#13836, état 3 de la maquette) : un cadre autour de l'élément, les
 * outils retirés, une seule barre d'actions libellées au-dessus de Public et Publier, et toucher la scène à vide la
 * referme. Le texte touché n'est pas écrit : c'est son Modifier qui l'écrit.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class ComposerSelectionActionBarTest {

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

    /** Aucune image n'est décodée ici : une scène qui porte un média n'en a pas besoin pour être sélectionnée. */
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

    private fun show(vm: StoryComposerViewModel) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 360.dp, height = 692.dp)) {
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

    private fun tapEmptyScene() {
        compose.onNodeWithContentDescription(canvas).performTouchInput { click(Offset(width * 0.15f, height * 0.35f)) }
    }

    @Test
    fun `a touched sticker is framed, the tools step aside and one labelled bar sits above publish`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onSceneBackgroundTap()
        show(vm)

        compose.onNodeWithContentDescription("😀").performClick()

        compose.onNodeWithContentDescription("😀").assertIsSelected()
        listOf("Edit", "Duplicate", "Remove").forEach { compose.onNodeWithText(it).assertExists() }
        listOf("Order", "Timing").forEach { compose.onNodeWithText(it).assertDoesNotExist() }
        listOf("Text", "Media", "Sticker", "More options").forEach { compose.onNodeWithContentDescription(it).assertDoesNotExist() }
        compose.onNodeWithContentDescription("Close").assertExists()
        compose.onNodeWithContentDescription("Undo").assertExists()
        val bar = compose.onNodeWithTag(SELECTION_BAR_TAG).getUnclippedBoundsInRoot()
        val publish = compose.onNodeWithContentDescription("Publish story").getUnclippedBoundsInRoot()
        assertThat(bar.bottom).isAtMost(publish.top)
    }

    @Test
    fun `touching the empty scene closes the bar and gives the tools back`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        show(vm)

        tapEmptyScene()

        compose.onNodeWithTag(SELECTION_BAR_TAG).assertDoesNotExist()
        compose.onNodeWithContentDescription("😀").assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
        compose.onNodeWithContentDescription("Text").assertExists()
        assertThat(vm.state.value.selectedSceneObject).isNull()
    }

    @Test
    fun `a touched text is framed without a keyboard, and its Edit writes it`() {
        val vm = viewModel()
        vm.onAddTextElement()
        vm.onTextChange("Bonjour")
        vm.onSceneBackgroundTap()
        show(vm)

        compose.onNodeWithText("Bonjour").performClick()

        compose.onNode(hasSetTextAction()).assertDoesNotExist()
        compose.onNodeWithContentDescription("Finish writing").assertDoesNotExist()
        compose.onNodeWithText("Edit").performClick()
        compose.onNode(hasSetTextAction()).assertIsFocused()
        compose.onNodeWithTag(SELECTION_BAR_TAG).assertDoesNotExist()
    }

    @Test
    fun `order opens bring forward and send backward, and moves the sticker`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onAddSticker("🎉")
        show(vm)

        compose.onNodeWithText("Order").performClick()
        compose.onNodeWithText("Bring forward").assertExists()
        compose.onNodeWithText("Send backward").performClick()

        assertThat(vm.state.value.deck.selectedSlide.stickers.first().emoji).isEqualTo("🎉")
        compose.onNodeWithText("Send backward").assertDoesNotExist()
    }

    @Test
    fun `remove takes the element away and the tools come back`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        show(vm)

        compose.onNodeWithText("Remove").performClick()

        assertThat(vm.state.value.deck.selectedSlide.stickers).isEmpty()
        compose.onNodeWithTag(SELECTION_BAR_TAG).assertDoesNotExist()
        compose.onNodeWithContentDescription("Text").assertExists()
    }

    @Test
    fun `timing is offered in an animated scene and opens the start and duration of the element`() {
        val vm = viewModel()
        vm.onSceneReduce(StoryComposerSceneReducer::animationToggled)
        vm.onBandDismiss()
        vm.onAddSticker("😀")
        show(vm)

        compose.onNodeWithText("Timing").performClick()

        compose.onNodeWithContentDescription("Text start time").assertExists()
        compose.onNodeWithContentDescription("Text visible duration").assertExists()
        compose.onNodeWithTag(SELECTION_BAR_TAG).assertDoesNotExist()
    }

    @Test
    fun `a media placed on the scene is named for TalkBack where it is drawn, and touching it frames it with its own bar`() {
        val vm = viewModel()
        withPlacedClip(vm)
        show(vm)
        val named = compose.onNodeWithContentDescription("Media on the scene").getUnclippedBoundsInRoot()
        val drawn = compose.onNodeWithTag("placed-media-placeholder", useUnmergedTree = true).getUnclippedBoundsInRoot()
        assertThat(named.left to named.top).isEqualTo(drawn.left to drawn.top)

        compose.onNodeWithContentDescription("Media on the scene").performClick()

        assertThat(vm.state.value.selectedMedia).isEqualTo("p")
        compose.onNodeWithContentDescription("Media on the scene").assertIsSelected()
        listOf("Edit", "Remove").forEach { compose.onNodeWithText(it).assertExists() }
    }

    @Test
    fun `a selection sheet whose element left the selection never reopens on the next one`() {
        val vm = viewModel()
        vm.onAddTextElement()
        vm.onTextChange("Bonjour")
        withPlacedClip(vm)
        vm.onSceneReduce { StoryComposerSelectionReducer.mediaSelected(it, "p") }
        show(vm)
        compose.onNodeWithText("Edit").performClick()
        compose.onNodeWithTag(SELECTION_BAR_TAG).assertDoesNotExist()

        val text = vm.state.value.deck.selectedSlide.elements.single().id
        compose.runOnIdle { vm.onSceneReduce { StoryComposerSceneReducer.trackSelected(it, text) } }
        compose.waitForIdle()
        compose.runOnIdle { vm.onSceneReduce { StoryComposerSelectionReducer.mediaSelected(it, "p") } }

        compose.onNodeWithTag(SELECTION_BAR_TAG).assertExists()
    }

    private fun withPlacedClip(vm: StoryComposerViewModel) {
        val clip = PendingMediaUpload("p", MediaUploadItem(ByteArray(4), "p.mp4", "video/mp4"))
        vm.onSceneReduce { state ->
            val slide = state.deck.selectedSlide
            state.copy(
                deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) it.copy(mediaIds = listOf("p"), placedMedia = listOf(StoryPlacedMedia("p"))) else it }),
                pendingUploads = listOf(clip),
            )
        }
    }
}
