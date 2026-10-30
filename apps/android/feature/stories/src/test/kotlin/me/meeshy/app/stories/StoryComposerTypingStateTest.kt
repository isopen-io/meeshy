package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.work.WorkManager
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
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le compositeur entier, un texte posé (#13835) : on lit ce qu'on tape dans le champ en place, une seule barre de style
 * est collée au clavier — sans ✕, sans outils, sans Publier, sans puce d'état ni « Terminé » —, ses icônes montrent
 * leurs choix à la place du clavier, et OK termine sans rien retirer. La légende ouverte par « ⋯ » prend le même état.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class StoryComposerTypingStateTest {

    @get:Rule
    val compose = createComposeRule()

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also { it.onEnterComposer() }
    }

    private fun show(vm: StoryComposerViewModel, morePanel: () -> StoryMorePanel? = { null }, onMorePanel: (StoryMorePanel?) -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 360.dp, height = 692.dp)) {
                    val state by vm.state.collectAsState()
                    StoryComposerSceneFirst(
                        state = state,
                        viewModel = vm,
                        sceneExport = SceneExportHost(SceneCapture(rememberGraphicsLayer(), SceneCapturePass.NONE), emptyList(), false) {},
                        doors = StoryComposerDoors(onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = {}),
                        morePanel = morePanel(),
                        onMorePanel = onMorePanel,
                        formatChevron = null,
                        keyboard = FixedTypingKeyboard(280f),
                    )
                }
            }
        }
    }

    @Test
    fun `a text being written is a focused field on the scene, under a single style bar and nothing else`() {
        val vm = viewModel()
        vm.onAddTextElement()
        show(vm)

        compose.onNode(hasSetTextAction()).assertIsFocused()
        listOf("Font", "Color", "Alignment", "Text background", "Finish writing").forEach {
            compose.onNodeWithContentDescription(it).assertExists()
        }
        listOf("Close", "Text", "Media", "More options", "Publish story", "Undo").forEach {
            compose.onNodeWithContentDescription(it).assertDoesNotExist()
        }
    }

    @Test
    fun `no state chip and no scrolling Done row while typing`() {
        val vm = viewModel()
        vm.onAddTextElement()
        show(vm)

        compose.onNodeWithText("STYLE", substring = true).assertDoesNotExist()
        compose.onNodeWithText("SIZE", substring = true).assertDoesNotExist()
        compose.onNodeWithText("Done").assertDoesNotExist()
        compose.onNodeWithText("Bold").assertDoesNotExist()
    }

    @Test
    fun `the font icon shows the styles, size and effect, and the text language last`() {
        val vm = viewModel()
        vm.onAddTextElement()
        show(vm)

        compose.onNodeWithContentDescription("Font").performClick()

        compose.onNodeWithText("Bold").assertExists()
        compose.onNodeWithContentDescription("Text size").assertExists()
        compose.onNodeWithContentDescription("Text fade in").assertExists()
        compose.onNodeWithText("Text language").assertExists()
    }

    @Test
    fun `the colour icon shows the colour then the titled outline, the backing icon the background then the titled frame`() {
        val vm = viewModel()
        vm.onAddTextElement()
        show(vm)

        compose.onNodeWithContentDescription("Color").performClick()
        compose.onNodeWithText("Text outline").assertExists()
        compose.onNodeWithText("Text frame").assertDoesNotExist()

        compose.onNodeWithContentDescription("Text background").performClick()
        compose.onNodeWithText("Text frame").assertExists()
        compose.onNodeWithText("Text outline").assertDoesNotExist()
    }

    @Test
    fun `a choice applies to the text being written, and OK ends the writing without removing it`() {
        val vm = viewModel()
        vm.onAddTextElement()
        show(vm)

        compose.onNodeWithContentDescription("Color").performClick()
        compose.onAllNodesWithContentDescription("#FF2E63")[0].performClick()
        compose.onNodeWithContentDescription("Finish writing").performClick()

        val state = vm.state.value
        assertThat(state.isEditingTextElement).isFalse()
        assertThat(state.selectedSlideTextElements.single().color).isEqualTo("FF2E63")
    }

    @Test
    fun `the caption opened from more takes the same state, its field on the keyboard with OK and no counter`() {
        val vm = viewModel()
        var panel by mutableStateOf<StoryMorePanel?>(StoryMorePanel.CAPTION)
        show(vm, morePanel = { panel }, onMorePanel = { panel = it })

        compose.onNode(hasSetTextAction()).assertIsFocused()
        compose.onNodeWithContentDescription("Publish story").assertDoesNotExist()
        compose.onNodeWithText("5000", substring = true).assertDoesNotExist()

        compose.onNodeWithContentDescription("Finish writing").performClick()
        assertThat(panel).isNull()
    }
}
