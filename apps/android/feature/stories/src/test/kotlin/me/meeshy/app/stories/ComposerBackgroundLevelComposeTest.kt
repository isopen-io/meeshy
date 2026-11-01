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
import androidx.compose.ui.test.SemanticsMatcher
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
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le FOND média suit la grammaire d'édition (#13973, spec R6) : tenu ou touché, il est sélectionné et pose son niveau
 * « Fond » à la place des outils — ses outils à plat, puis Remplacer · Mettre sur la scène · Retirer (#14047) —, l'audience, Publier et Fermer
 * se retirent, aucun menu ne flotte sur la scène ; Retirer se confirme, Remplacer ouvre la feuille de ses sources.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class ComposerBackgroundLevelComposeTest {

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
    private val actions = listOf("Replace", "Place on the scene", "Remove")

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
                CompositionLocalProvider(LocalReduceMotion provides true) {
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

    private fun withBackgroundPhoto(vm: StoryComposerViewModel) {
        val photo = PendingMediaUpload("bg", MediaUploadItem(ByteArray(4), "bg.jpg", "image/jpeg"))
        vm.onSceneReduce { state ->
            val slide = state.deck.selectedSlide
            state.copy(
                deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) it.copy(mediaIds = listOf("bg")) else it }),
                pendingUploads = listOf(photo),
            )
        }
    }

    private fun holdScene() = compose.onNodeWithContentDescription(canvas).performTouchInput { longClick(Offset(width * 0.5f, height * 0.5f)) }

    private fun tapScene() = compose.onNodeWithContentDescription(canvas).performTouchInput { click(Offset(width * 0.5f, height * 0.5f)) }

    private fun assertLevelShown() {
        val shown = compose.onNodeWithTag(EDITING_RAIL_TAG).onChildren().fetchSemanticsNodes()
            .mapNotNull { node -> node.config.getOrNull(SemanticsProperties.Text)?.joinToString { it.text } }
        assertThat(shown.first()).isEqualTo("Framing")
        assertThat(shown.takeLast(actions.size)).containsExactlyElementsIn(actions).inOrder()
        listOf("Edit", "Duplicate", "Timing").forEach { compose.onNodeWithText(it).assertDoesNotExist() }
        listOf("Audience", "Publish story", "Close", "Text").forEach { compose.onNodeWithContentDescription(it).assertDoesNotExist() }
    }

    /** Une entrée du rail, défilé jusqu'à elle : le rail à plat dépasse la hauteur et défile (#14047). */
    private fun tapRail(text: String) {
        compose.onNodeWithText(text).performScrollTo().performClick()
    }

    @Test
    fun `holding the background media selects it and lays the level Fond in place of the tools, publication away`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)

        holdScene()

        assertThat(vm.state.value.selectionSubject).isEqualTo(ComposerSelectionSubject.BACKGROUND)
        assertLevelShown()
    }

    @Test
    fun `touching the background media selects it too, and touching it again gives the tools back`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)

        tapScene()
        assertLevelShown()

        tapScene()
        assertThat(vm.state.value.selectedSceneObject).isNull()
        compose.onNodeWithContentDescription("Publish story").assertExists()
        compose.onNodeWithContentDescription("Text").assertExists()
    }

    @Test
    fun `Remove asks first, Cancel keeps the background, Remove takes it off`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)
        holdScene()

        tapRail("Remove")
        compose.onNodeWithText("Remove the background?").assertExists()
        compose.onNodeWithText("Cancel").performClick()
        assertThat(vm.state.value.deck.selectedSlide.mediaIds).containsExactly("bg")
        assertThat(vm.state.value.selectionSubject).isEqualTo(ComposerSelectionSubject.BACKGROUND)

        tapRail("Remove")
        compose.onAllNodesWithText("Remove").fetchSemanticsNodes().let { nodes ->
            compose.onAllNodesWithText("Remove")[nodes.lastIndex].performClick()
        }

        assertThat(vm.state.value.deck.selectedSlide.mediaIds).isEmpty()
        compose.onNodeWithText("Remove the background?").assertDoesNotExist()
        compose.onNodeWithContentDescription("Publish story").assertExists()
    }

    @Test
    fun `Place on the scene makes the background a selected placed object at once`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)
        holdScene()

        tapRail("Place on the scene")

        assertThat(vm.state.value.deck.selectedSlide.placedMedia.map { it.mediaId }).containsExactly("bg")
        assertThat(vm.state.value.selectionSubject).isEqualTo(ComposerSelectionSubject.OBJECT)
        compose.onNodeWithText("Timing").assertExists()
        compose.onNodeWithText("Replace").assertDoesNotExist()
    }

    @Test
    fun `Replace opens the sheet of its sources, and a source replaces this very background`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)
        holdScene()

        tapRail("Replace")

        compose.onNodeWithTag(BACKGROUND_SOURCES_TAG).assertExists()
        compose.onNodeWithText("Photo library").assertExists()
        compose.onNodeWithText("From files").assertExists()
        compose.onNodeWithText("Take a photo").assertDoesNotExist()
        compose.onNodeWithText("From files").performSemanticsAction(SemanticsActions.OnClick)

        assertThat(replaced).containsExactly(ComposerBackgroundSource.FILES to "bg")
        compose.onNodeWithTag(BACKGROUND_SOURCES_TAG).assertDoesNotExist()
    }

    @Test
    fun `no menu floats over the scene when the background is held`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)

        holdScene()

        compose.onNodeWithText("Scene background").assertDoesNotExist()
        compose.onNodeWithText("Bring to front").assertDoesNotExist()
    }
}
