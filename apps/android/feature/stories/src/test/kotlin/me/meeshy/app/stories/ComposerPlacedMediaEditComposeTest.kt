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
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.click
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onChildren
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.printToLog
import androidx.compose.ui.test.swipe
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
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerSelectionSubject
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundSource
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectMenu
import androidx.compose.ui.test.performScrollTo
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Les outils d'une image ou d'une vidéo POSÉE (#13973, lot A-E4, à plat depuis #14047) : sélectionnée, elle pose ses outils À
 * PLAT dans le rail, puis Dupliquer · Temps · Retirer — plus de « Modifier », plus de feuille à pastilles, plus de « Plan » —,
 * Recadrer se règle par le geste sur l'objet de la scène, Pivoter tourne d'un quart, la vidéo règle son volume et se coupe,
 * Retour descend d'un niveau sans toucher au document.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class ComposerPlacedMediaEditComposeTest {

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

    private val replaced = mutableListOf<Pair<ComposerBackgroundSource, String>>()

    private fun show(vm: StoryComposerViewModel) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides true, LocalStickerLift provides StickerLiftSource { _, _ -> { lifted += 1 } }) {
                    Box(Modifier.size(width = 360.dp, height = 692.dp)) {
                        val state by vm.state.collectAsState()
                        var sheet by remember { mutableStateOf<StoryComposerSheet?>(null) }
                        StoryComposerSceneFirst(
                            state = state,
                            viewModel = vm,
                            sceneExport = SceneExportHost(emptyList(), false) {},
                            doors = StoryComposerDoors(
                                onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = {},
                                onReplaceBackground = { source, replacing -> replaced += source to replacing },
                            ),
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

    private fun withPlaced(vm: StoryComposerViewModel, mime: String = "image/jpeg", durationMs: Long? = null) {
        val media = UploadedMedia(id = "m1", url = "https://cdn/m1", mimeType = mime, fileSize = 1, width = 1080, height = 1920, durationMs = durationMs, thumbnailUrl = "https://cdn/t")
        vm.onSceneReduce { state ->
            val slide = state.deck.selectedSlide
            val loaded = state.copy(
                deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) it.copy(mediaIds = listOf("m1")) else it }),
                attachments = listOf(media),
            )
            StoryComposerSelectionReducer.mediaSelected(StoryComposerPlacedMediaReducer.placed(loaded, "m1"), "m1")
        }
    }

    private fun placed() = vm.state.value.deck.selectedSlide.placedMedia.single()

    private lateinit var vm: StoryComposerViewModel

    private var lifted = 0

    private fun modify(mime: String = "image/jpeg", durationMs: Long? = null) {
        vm = viewModel()
        withPlaced(vm, mime, durationMs)
        show(vm)
    }

    private val selectionActions = arrayOf("Duplicate", "Timing", "Remove")

    private fun railShown(): List<String> = compose.onNodeWithTag(EDITING_RAIL_TAG).onChildren().fetchSemanticsNodes()
        .mapNotNull { node -> node.config.getOrNull(SemanticsProperties.Text)?.joinToString { text -> text.text } }

    /** Une entrée du rail, défilé jusqu'à elle : le rail à plat dépasse la hauteur et défile (#14047). */
    private fun tapRail(text: String) {
        compose.onNodeWithText(text).performScrollTo().performClick()
    }

    @Test
    fun `a selected placed image lays its tools flat in the order of the tree, then Duplicate, Timing and Remove, without Edit`() {
        modify()

        assertThat(railShown().filterNot { it == "Frames" }).containsExactly(
            "Crop", "Filters", "Adjust", "Effects", "Rotate", "Describe", "Set as background", "Make a sticker", *selectionActions,
        ).inOrder()
        compose.onNodeWithText("Edit").assertDoesNotExist()
        compose.onNodeWithText("Back").assertDoesNotExist()
        compose.onNodeWithText("Plan").assertDoesNotExist()
        compose.onNodeWithTag(PLACED_BAND_TAG).assertDoesNotExist()
        compose.onNodeWithTag("placed-crop-stage").assertDoesNotExist()
        listOf("Audience", "Publish story").forEach { compose.onNodeWithContentDescription(it).assertDoesNotExist() }
    }

    @Test
    fun `Rotate turns the placed media a quarter at once, staying on its level`() {
        modify()

        tapRail("Rotate")

        assertThat(placed().rotationDeg).isEqualTo(-90f)
        assertThat(railShown()).contains("Rotate")
    }

    @Test
    fun `Crop frames the image by the gesture on the scene object, its pose untouched`() {
        modify()
        tapRail("Crop")
        compose.onNodeWithTag(PLACED_BAND_TAG).assertExists()
        compose.onNodeWithText("1:1").performClick()
        val framed = placed().crop!!
        val (x, y) = placed().x to placed().y

        compose.onNodeWithTag("placed-media").performTouchInput { swipe(center, center.copy(y = center.y + height * 0.3f), durationMillis = 300) }

        val after = placed()
        assertThat(after.crop).isNotNull()
        assertThat(after.crop!!.y).isLessThan(framed.y)
        assertThat(after.crop!!.width).isWithin(1e-6).of(framed.width)
        assertThat(after.x to after.y).isEqualTo(x to y)
    }

    @Test
    fun `Make a sticker lifts the subject of the placed image at once`() {
        modify()

        tapRail("Make a sticker")

        assertThat(lifted).isEqualTo(1)
    }

    @Test
    fun `Back goes down from the band to the flat rail, the placed object untouched`() {
        modify()
        tapRail("Adjust")
        compose.onNodeWithTag(PLACED_BAND_TAG).assertExists()
        val before = placed()

        compose.onNodeWithText("Back").performClick()

        compose.onNodeWithTag(PLACED_BAND_TAG).assertDoesNotExist()
        assertThat(railShown()).containsAtLeast("Crop", "Duplicate").inOrder()
        compose.onNodeWithText("Back").assertDoesNotExist()
        assertThat(placed()).isEqualTo(before)
    }

    @Test
    fun `a placed video offers Trim and Sound, and Sound sets its volume and mutes it`() {
        modify("video/mp4", 8_000)

        assertThat(railShown()).containsAtLeast("Trim", "Filters", "Adjust", "Sound", "Rotate", "Describe", *selectionActions).inOrder()
        assertThat(railShown()).containsNoneOf("Crop", "Effects", "Make a sticker")
        tapRail("Sound")
        compose.onNodeWithTag(COMPOSER_VOLUME_TAG).performSemanticsAction(SemanticsActions.SetProgress) { it(0.3f) }
        assertThat(placed().volume).isWithin(1e-4f).of(0.3f)
        compose.onNodeWithText("30 %").assertExists()

        compose.onNodeWithTag(PLACED_MUTE_TAG).performClick()
        assertThat(placed().volume).isEqualTo(0f)
        compose.onNodeWithTag(PLACED_MUTE_TAG).performClick()
        assertThat(placed().volume).isWithin(1e-4f).of(0.3f)
    }

    @Test
    fun `a media posed on the right edge, selected, keeps the scene full and its rail laid on it`() {
        vm = viewModel()
        withPlaced(vm)
        vm.onSceneReduce { s -> s.copy(deck = s.deck.copy(slides = s.deck.slides.map { slide -> slide.copy(placedMedia = slide.placedMedia.map { it.copy(x = 0.8f, scale = 0.3f) }) })) }
        show(vm)
        compose.waitForIdle()

        val scene = compose.onNodeWithContentDescription(canvas).fetchSemanticsNode().boundsInRoot
        val rail = compose.onNodeWithTag(EDITING_RAIL_TAG).fetchSemanticsNode().boundsInRoot
        assertThat(scene.width).isWithin(1f).of(360f * compose.density.density)
        assertThat(rail.right).isAtMost(scene.right)
    }

    @Test
    fun `Describe opens the bottom sheet of the description of the placed media`() {
        modify()

        tapRail("Describe")

        compose.onNodeWithTag(BACKGROUND_DESCRIPTION_TAG).assertExists()
    }

    @Test
    fun `Set as background lays the rail Fond with no sheet opening by itself`() {
        modify("video/mp4", 8_000)

        tapRail("Set as background")

        assertThat(vm.state.value.selectedSlideBackdropMediaId).isEqualTo("m1")
        assertThat(vm.state.value.deck.selectedSlide.placedMedia).isEmpty()
        StoryComposerSheet.entries.filter { it.servesSelection && it != StoryComposerSheet.BACKGROUND_SOURCE && it != StoryComposerSheet.BACKGROUND_DESCRIPTION }
            .forEach { assertThat(vm.state.value.serves(it)).isFalse() }
        assertThat(railShown()).containsAtLeast("Framing", "Replace", "Place on the scene", "Remove").inOrder()
        compose.onNodeWithTag(BACKGROUND_SOURCES_TAG).assertDoesNotExist()
        compose.onNodeWithTag("adjust-slider").assertDoesNotExist()
    }

    @Test
    fun `the new background shows its whole list at once, and Back from Adjust goes down one level without touching the document`() {
        modify("video/mp4", 8_000)
        tapRail("Set as background")

        assertThat(railShown()).containsExactly(
            "Framing", "Trim", "Filters", "Adjust", "Sound", "Loop", "Rotate", "Describe", "Replace", "Place on the scene", "Remove",
        ).inOrder()
        compose.onNodeWithTag(BACKGROUND_BAND_TAG).assertDoesNotExist()
        tapRail("Adjust")
        compose.onNodeWithTag("adjust-slider").performSemanticsAction(SemanticsActions.SetProgress) { it(0.4f) }
        val adjusted = vm.state.value.deck

        compose.onNodeWithText("Back").performClick()

        assertThat(vm.state.value.deck).isEqualTo(adjusted)
        assertThat(vm.state.value.selectionSubject).isEqualTo(ComposerSelectionSubject.BACKGROUND)
        assertThat(vm.state.value.deck.selectedSlide.placedMedia).isEmpty()
        assertThat(railShown()).containsAtLeast("Adjust", "Place on the scene").inOrder()
        compose.onNodeWithTag(BACKGROUND_BAND_TAG).assertDoesNotExist()
        compose.onNodeWithText("Back").assertDoesNotExist()
    }

    @Test
    fun `a sheet opened for the placed media closes when it becomes the background, and never comes back by itself`() {
        modify()
        tapRail("Describe")
        compose.onNodeWithTag(BACKGROUND_DESCRIPTION_TAG).assertExists()

        compose.runOnIdle { vm.onObjectController(SceneObjectRef(ComposerObjectKind.MEDIA, "m1"), SceneObjectMenu.Action.SET_AS_BACKGROUND) }

        compose.onNodeWithTag(BACKGROUND_DESCRIPTION_TAG).assertDoesNotExist()
        compose.onNodeWithTag(BACKGROUND_SOURCES_TAG).assertDoesNotExist()
        assertThat(railShown()).containsAtLeast("Framing", "Replace", "Place on the scene", "Remove").inOrder()
    }
}

