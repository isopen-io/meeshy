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
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.click
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
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
import me.meeshy.sdk.model.StoryAudioPlayerObject
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
 * #13852 — le plateau du compositeur peint les objets de la scène dans l'ordre UNIQUE de la pile (la composition est
 * l'ordre de peinture et de toucher), la pastille d'un son posé y vit comme un objet, et l'Ordre s'ouvre sur les quatre
 * gestes d'iOS dès qu'un autre objet partage la scène, quelle que soit sa famille.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class ComposerSceneStackComposeTest {

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

    private fun painted(): List<String> =
        compose.onAllNodes(hasText("Bonjour") or hasContentDescription("😀")).fetchSemanticsNodes().map { node ->
            node.config.getOrNull(SemanticsProperties.Text)?.joinToString { it.text }
                ?: node.config.getOrNull(SemanticsProperties.ContentDescription).orEmpty().joinToString()
        }

    @Test
    fun `a text written after a sticker paints above it, and touching the sticker paints it above the text`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onAddTextElement()
        vm.onTextChange("Bonjour")
        vm.onSceneBackgroundTap()
        show(vm)

        assertThat(painted()).containsExactly("😀", "Bonjour").inOrder()

        val sticker = vm.state.value.deck.selectedSlide.stickers.single().id
        vm.onSelectSticker(sticker)
        compose.waitForIdle()

        assertThat(painted()).containsExactly("Bonjour", "😀").inOrder()
    }

    @Test
    fun `a sound posed on the scene is a chip of the composer scene, touched like a sticker`() {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onSceneReduce { it.copy(deck = it.deck.withSelectedAudio(listOf(StoryAudioPlayerObject(id = "voice", postMediaId = "pm", x = 0.5, y = 0.7)))) }
        vm.onSceneBackgroundTap()
        show(vm)

        compose.onNodeWithContentDescription("Sound on the scene").performClick()

        assertThat(vm.state.value.selectedSoundId).isEqualTo("voice")
        compose.onNodeWithText("Order").assertDoesNotExist()
        listOf("Edit", "Duplicate", "Remove").forEach { compose.onNodeWithText(it).assertExists() }
    }

    @Test
    fun `the background sound never comes on the scene`() {
        val vm = viewModel()
        vm.onSceneReduce { it.copy(deck = it.deck.withSelectedAudio(listOf(StoryAudioPlayerObject(id = "ambiance", postMediaId = "pm", isBackground = true)))) }
        show(vm)

        compose.onNodeWithContentDescription("Sound on the scene").assertDoesNotExist()
    }
}
