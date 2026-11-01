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
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
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
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerFormat
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
 * #14249 — retour porteur : « On réduit pour le clavier ou pour afficher une feuille avec des options. » La scène garde sa
 * taille pleine quand on sélectionne un objet, qu'on touche le fond ou que leurs outils se posent à plat dans le rail ; elle
 * se réduit, ENTIÈRE, au-dessus du clavier ou de ce qui est effectivement dessiné en bas — bande d'un réglage ou feuille —
 * et rien ne la recouvre alors.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class SceneReducesForKeyboardOrSheetComposeTest {

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

    private val storyCanvas = "Story canvas — pinch to zoom, drag to pan"

    private fun density(): Float = compose.density.density

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also { it.onEnterComposer() }
    }

    private fun show(vm: StoryComposerViewModel, morePanel: StoryMorePanel? = null) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides true, LocalStickerLift provides StickerLiftSource { _, _ -> null }) {
                    Box(Modifier.size(width = 360.dp, height = 692.dp)) {
                        val state by vm.state.collectAsState()
                        var sheet by remember { mutableStateOf<StoryComposerSheet?>(null) }
                        StoryComposerSceneFirst(
                            state = state,
                            viewModel = vm,
                            sceneExport = SceneExportHost(emptyList(), false) {},
                            doors = StoryComposerDoors(onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = {}),
                            morePanel = morePanel,
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

    private fun scene(canvas: String = storyCanvas): Rect = compose.onNodeWithContentDescription(canvas).fetchSemanticsNode().boundsInRoot

    private fun assertSceneFull(canvas: String = storyCanvas) {
        val scene = scene(canvas)
        assertThat(scene.width).isWithin(1f).of(360f * density())
        assertThat(scene.height).isWithin(1f).of(640f * density())
    }

    private fun withMedia(vm: StoryComposerViewModel, id: String) {
        val media = UploadedMedia(id = id, url = "https://cdn/$id", mimeType = "image/jpeg", fileSize = 1, width = 1080, height = 1920, durationMs = null, thumbnailUrl = null)
        vm.onSceneReduce { state ->
            val slide = state.deck.selectedSlide
            state.copy(
                deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) it.copy(mediaIds = listOf(id)) else it }),
                attachments = listOf(media),
            )
        }
    }

    private fun withPlacedMediaSelected(vm: StoryComposerViewModel) {
        withMedia(vm, "m1")
        vm.onSceneReduce { state -> StoryComposerSelectionReducer.mediaSelected(StoryComposerPlacedMediaReducer.placed(state, "m1"), "m1") }
    }

    private fun holdBackground() = compose.onNodeWithContentDescription(storyCanvas).performTouchInput { longClick(Offset(width * 0.5f, height * 0.5f)) }

    private fun tapRail(text: String) {
        compose.onNodeWithText(text).performScrollTo().performClick()
        compose.waitForIdle()
    }

    @Test
    fun `selecting a sticker keeps the scene full, its options laid on it`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onSelectSticker(vm.state.value.deck.selectedSlide.stickers.single().id)
        show(vm)

        compose.onNodeWithTag(EDITING_RAIL_TAG).assertExists()
        assertSceneFull()
    }

    @Test
    fun `a sticker posed on a post is selected with no sheet at the bottom, and the scene stays full`() {
        val vm = viewModel()
        vm.onSceneReduce { it.copy(format = ComposerFormat.POST) }
        show(vm)

        vm.onAddSticker("😎")
        compose.waitForIdle()

        assertThat(vm.state.value.selectedSceneObject).isNotNull()
        compose.onNodeWithText("Duplicate").assertExists()
        assertSceneFull("Post canvas — pinch to zoom, drag to pan")
    }

    @Test
    fun `a placed media's tools flat in the rail keep the scene full`() {
        val vm = viewModel()
        withPlacedMediaSelected(vm)
        show(vm)

        compose.onNodeWithText("Filters").assertExists()
        assertSceneFull()
    }

    @Test
    fun `holding the background lays its tools on a full scene`() {
        val vm = viewModel()
        withMedia(vm, "bg")
        show(vm)

        holdBackground()
        compose.waitForIdle()

        compose.onNodeWithText("Framing").assertExists()
        assertSceneFull()
    }

    @Test
    fun `a writing panel the composer does not raise leaves the scene full and draws no empty panel at the bottom`() {
        val vm = viewModel()
        assertThat(vm.state.value.writesPostText).isFalse()
        show(vm, morePanel = StoryMorePanel.POST_TEXT)

        assertSceneFull()
        compose.onNodeWithContentDescription("Close").assertExists()
    }

    @Test
    fun `a setting band drawn at the bottom reduces the scene above it, and the options it keeps never cover it`() {
        val vm = viewModel()
        withPlacedMediaSelected(vm)
        show(vm)

        tapRail("Filters")

        val scene = scene()
        val band = compose.onNodeWithTag(PLACED_BAND_TAG).fetchSemanticsNode().boundsInRoot
        val back = compose.onNodeWithText("Back").fetchSemanticsNode().boundsInRoot
        assertThat(scene.height).isLessThan(640f * density() - 1f)
        assertThat(scene.bottom).isAtMost(band.top + 1f)
        assertThat(scene.right).isAtMost(back.left + 1f)
    }

    @Test
    fun `a sheet of options reduces the scene above it`() {
        val vm = viewModel()
        withMedia(vm, "bg")
        show(vm)
        holdBackground()
        compose.waitForIdle()

        tapRail("Describe")

        val scene = scene()
        val sheet = compose.onNodeWithTag(BACKGROUND_DESCRIPTION_TAG).fetchSemanticsNode().boundsInRoot
        assertThat(scene.height).isLessThan(640f * density() - 1f)
        assertThat(scene.bottom).isAtMost(sheet.top + 1f)
    }

    @Test
    fun `writing a text reduces the scene above the keyboard and its bar, nothing laid over it`() {
        val vm = viewModel()
        vm.onAddTextElement()
        show(vm)

        val scene = scene()
        val bar = compose.onNodeWithContentDescription("Font").fetchSemanticsNode().boundsInRoot
        assertThat(scene.height).isLessThan(640f * density() - 1f)
        assertThat(scene.bottom).isAtMost(bar.top + 1f)
        assertThat(scene.bottom).isAtMost((692f - 280f) * density() + 1f)
        listOf("Close", "Text", "More options", "Publish story").forEach { compose.onNodeWithContentDescription(it).assertDoesNotExist() }
    }
}
