package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
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
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.composer.StoryToolMode
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
 * #14186 — recette S8 : l'outil Fond ouvrait son panneau, la scène se réduisait au-dessus, et ✕, ↶ ↷, les vignettes des
 * diapos et la colonne des outils restaient posés là où ils étaient en plein écran, sur la scène réduite. Un panneau ou la
 * bande d'un réglage monté au bas ne laisse voir que la scène réduite et lui-même ; les options d'un objet en édition
 * restent, dans le couloir que la scène leur cède.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class ReducedSceneBareComposeTest {

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

    private val restingOnTheScene = listOf("Close", "Undo", "Redo", "Publication scenes", "Text", "Media", "Sticker", "More options", "Publish story")

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

    /** Deux diapos, un pas à annuler et un à rétablir (un bouton sans pas se masque, #14209) : au repos, ✕, ↶ ↷, la rangée des diapos et les outils sont sur la scène. */
    private fun twoSlidesWithHistory(): StoryComposerViewModel = viewModel().also {
        it.onAddSlide()
        it.onAddSlide()
        it.onUndo()
    }

    @Test
    fun `at rest close, undo, the slide strip and the tools are on the scene`() {
        val vm = twoSlidesWithHistory()
        show(vm)

        restingOnTheScene.forEach { compose.onNodeWithContentDescription(it).assertExists() }
    }

    @Test
    fun `the background panel leaves only the reduced scene and itself`() {
        val vm = twoSlidesWithHistory()
        show(vm)

        compose.onNodeWithContentDescription("Background").performClick()
        compose.waitForIdle()

        assertThat(vm.state.value.band.activeTool).isEqualTo(StoryToolMode.TEXTURE)
        restingOnTheScene.forEach { compose.onNodeWithContentDescription(it).assertDoesNotExist() }
    }

    @Test
    fun `a posed media's setting at the bottom keeps its rail, and nothing else, on the reduced scene`() {
        val vm = viewModel()
        val photo = PendingMediaUpload("p", MediaUploadItem(ByteArray(4), "p.jpg", "image/jpeg"))
        vm.onSceneReduce { state ->
            val slide = state.deck.selectedSlide
            state.copy(
                deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) it.copy(mediaIds = listOf("p"), placedMedia = listOf(StoryPlacedMedia("p"))) else it }),
                pendingUploads = listOf(photo),
            )
        }
        vm.onAddSticker("😀")
        show(vm)
        compose.onNodeWithContentDescription("Media on the scene").performClick()
        compose.onNodeWithContentDescription("Undo").assertExists()

        compose.onNodeWithText("Filters").performClick()
        compose.waitForIdle()

        compose.onNodeWithText("Back").assertExists()
        listOf("Close", "Undo", "Redo", "Publish story").forEach { compose.onNodeWithContentDescription(it).assertDoesNotExist() }
    }
}
