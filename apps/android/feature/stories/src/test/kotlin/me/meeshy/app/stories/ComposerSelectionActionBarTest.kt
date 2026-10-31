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
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.semantics.SemanticsActions
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
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerObjectTiming
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
        listOf("Edit", "Duplicate", "Timing", "Remove").forEach { compose.onNodeWithText(it).assertExists() }
        compose.onNodeWithText("Order").assertDoesNotExist()
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
    fun `timing is offered in a still scene and opens the window of the element`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        show(vm)

        compose.onNodeWithText("Timing").performClick()

        compose.onNodeWithText("From 0.0 s to the end").assertExists()
        compose.onNodeWithContentDescription("Start").assertExists()
        compose.onNodeWithTag(SELECTION_BAR_TAG).assertDoesNotExist()
    }

    @Test
    fun `Timing on a placed video says its family and window, never the text's words, and lights its own track`() {
        val vm = viewModel()
        withPlacedClip(vm)
        vm.onSceneReduce { StoryComposerSelectionReducer.mediaSelected(it, "p") }
        vm.onSceneReduce { StoryComposerObjectTimeReducer.windowed(it, SceneObjectRef(ComposerObjectKind.MEDIA, "p"), ComposerObjectTiming(1.0, 3.0)) }
        show(vm)

        compose.onNodeWithText("Timing").performClick()

        compose.onNodeWithText("From 1.0 s to 3.0 s").assertExists()
        compose.onNodeWithContentDescription("Start").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "1.0 s"))
        compose.onNodeWithContentDescription("End").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "3.0 s"))
        compose.onNodeWithContentDescription("Text start time").assertDoesNotExist()
        compose.onNode(hasText("Video") and isSelected()).assertExists()
    }

    @Test
    fun `Timing on a place names it a place, and its permanent switch closes the window to the slide`() {
        val vm = viewModel()
        val place = me.meeshy.sdk.model.StoryLocationObject(id = "l1", place = me.meeshy.sdk.model.SharedPlace(latitude = 48.8, longitude = 2.3, name = "Paris"))
        vm.onSceneReduce { it.copy(deck = it.deck.addPlaceToSelected(place)) }
        vm.onSelectPlace("l1")
        show(vm)

        compose.onNodeWithText("Timing").performClick()
        compose.onNodeWithText("Place").assertExists()
        compose.onNode(hasText("Paris") and isSelected()).assertExists()
        compose.onNodeWithText("Visible from start to end").performSemanticsAction(SemanticsActions.OnClick)

        val stored = vm.state.value.deck.selectedSlide.places.single()
        assertThat(stored.duration).isEqualTo(vm.state.value.selectedSlideDurationSeconds)
        compose.onNodeWithContentDescription("End").assertExists()
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
        listOf("Edit", "Duplicate", "Timing", "Remove").forEach { compose.onNodeWithText(it).assertExists() }
    }

    private fun assertBarOffersDuplicateAndTiming(select: (StoryComposerViewModel) -> Unit) {
        val vm = viewModel()
        select(vm)
        show(vm)
        listOf("Duplicate", "Timing", "Remove").forEach { compose.onNodeWithText(it).assertExists() }
    }

    @Test
    fun `a selected text shows Duplicate and Timing in its bar`() = assertBarOffersDuplicateAndTiming { vm ->
        vm.onAddTextElement()
        vm.onTextChange("Bonjour")
        vm.onSceneBackgroundTap()
        vm.onSceneReduce { StoryComposerTextReducer.tapped(it, it.deck.selectedSlide.elements.single().id) }
    }

    @Test
    fun `a selected sticker shows Duplicate and Timing in its bar`() = assertBarOffersDuplicateAndTiming { vm -> vm.onAddSticker("😀") }

    @Test
    fun `a selected placed media shows Duplicate and Timing in its bar`() = assertBarOffersDuplicateAndTiming { vm ->
        withPlacedClip(vm)
        vm.onSceneReduce { StoryComposerSelectionReducer.mediaSelected(it, "p") }
    }

    @Test
    fun `a selected place shows Duplicate and Timing in its bar`() = assertBarOffersDuplicateAndTiming { vm ->
        val place = me.meeshy.sdk.model.StoryLocationObject(id = "l1", place = me.meeshy.sdk.model.SharedPlace(latitude = 48.8, longitude = 2.3, name = "Paris"))
        vm.onSceneReduce { it.copy(deck = it.deck.addPlaceToSelected(place)) }
        vm.onSelectPlace("l1")
    }

    @Test
    fun `a selected sound chip shows Duplicate and Timing in its bar`() = assertBarOffersDuplicateAndTiming { vm ->
        val voice = me.meeshy.sdk.model.StoryAudioPlayerObject(id = "a1", postMediaId = "pm", x = 0.5, y = 0.7)
        vm.onSceneReduce { s -> s.copy(deck = s.deck.copy(slides = s.deck.slides.map { it.copy(audio = listOf(voice)) })) }
        vm.onSceneReduce { StoryComposerSelectionReducer.soundSelected(it, "a1") }
    }

    @Test
    fun `Duplicate on a placed media lands a selected copy of the same file, and Timing opens its window`() {
        val vm = viewModel()
        withPlacedClip(vm)
        vm.onSceneReduce { StoryComposerSelectionReducer.mediaSelected(it, "p") }
        show(vm)

        compose.onNodeWithText("Duplicate").performClick()

        val slide = vm.state.value.deck.selectedSlide
        assertThat(slide.placedMedia.map { it.mediaId }).containsExactly("p", "p")
        assertThat(vm.state.value.selectedMediaId).isEqualTo(slide.placedMedia.last().id)
        assertThat(slide.mediaIds).containsExactly("p")
        compose.onNodeWithText("Timing").performClick()
        compose.onNodeWithText("From 0.0 s to the end").assertExists()
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

    @Test
    fun `Modifier on a placed photo offers filters and frames, and a touched filter and frame become its look`() {
        val vm = viewModel()
        val photo = PendingMediaUpload("p", MediaUploadItem(ByteArray(4), "p.jpg", "image/jpeg"))
        vm.onSceneReduce { state ->
            val slide = state.deck.selectedSlide
            state.copy(
                deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) it.copy(mediaIds = listOf("p"), placedMedia = listOf(StoryPlacedMedia("p"))) else it }),
                pendingUploads = listOf(photo),
            )
        }
        vm.onSceneReduce { StoryComposerSelectionReducer.mediaSelected(it, "p") }
        show(vm)
        compose.onNodeWithText("Edit").performClick()

        tapInSheet("Filters & frames")
        tapInSheet("Warm")
        tapInSheet("Frames")
        tapInSheet("Polaroid")

        assertThat(vm.state.value.mediaLookOf("p")).isEqualTo(me.meeshy.sdk.model.StoryMediaLook(filterPreset = "warm", frameId = "classic:polaroid"))
        assertThat(vm.state.value.deck.selectedSlide.mediaIds).containsExactly("p")
    }

    /** La feuille de sélection vit dans sa propre fenêtre : sous Robolectric, un toucher par coordonnées tombe sur la scène. */
    private fun tapInSheet(text: String) {
        compose.onNodeWithText(text).performSemanticsAction(SemanticsActions.OnClick)
        compose.waitForIdle()
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
