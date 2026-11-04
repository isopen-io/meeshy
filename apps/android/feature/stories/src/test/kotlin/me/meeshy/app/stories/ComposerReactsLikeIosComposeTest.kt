package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
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
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerSelectionSubject
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
 * Même geste, même effet, même annonce qu'iOS (#15863) : le bouton Fond SÉLECTIONNE un fond média peint (iOS
 * `handleRestTool`) au lieu d'ouvrir le panneau des fonds, TalkBack dit « Fond sélectionné » comme VoiceOver, et la colonne
 * des outils se nomme « Outils de la scène » (`ComposerRestChromeCopy.column`).
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class ComposerReactsLikeIosComposeTest {

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

    private val backgroundTool = "Choose a background"

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
                CompositionLocalProvider(LocalReduceMotion provides true) {
                    Box(Modifier.size(width = 360.dp, height = 692.dp)) {
                        val state by vm.state.collectAsState()
                        StoryComposerSceneFirst(
                            state = state,
                            viewModel = vm,
                            sceneExport = SceneExportHost(emptyList(), false) {},
                            doors = StoryComposerDoors(
                                onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = {},
                            ),
                            morePanel = null,
                            onMorePanel = {},
                            formatChevron = null,
                            sheet = StorySheetSlot(open = null, onDismiss = {}, onOpen = {}) {},
                            keyboard = FixedTypingKeyboard(280f),
                        )
                    }
                }
            }
        }
    }

    private fun withBackgroundPhoto(vm: StoryComposerViewModel) {
        val media = UploadedMedia(id = "bg", url = "https://cdn/bg", mimeType = "image/jpeg", fileSize = 1, width = 1080, height = 1920, durationMs = null, thumbnailUrl = null)
        vm.onSceneReduce { state ->
            val slide = state.deck.selectedSlide
            state.copy(
                deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) it.copy(mediaIds = listOf("bg")) else it }),
                attachments = listOf(media),
            )
        }
    }

    @Test
    fun `the Background tool selects the painted background media instead of opening the backgrounds panel`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)

        compose.onNodeWithContentDescription(backgroundTool).performClick()
        compose.waitForIdle()

        assertThat(vm.state.value.selectionSubject).isEqualTo(ComposerSelectionSubject.BACKGROUND)
        assertThat(vm.state.value.band.activeTool).isNotEqualTo(StoryToolMode.TEXTURE)
    }

    @Test
    fun `without a background media the Background tool still opens the backgrounds panel`() {
        val vm = viewModel()
        show(vm)

        compose.onNodeWithContentDescription(backgroundTool).performClick()
        compose.waitForIdle()

        assertThat(vm.state.value.band.activeTool).isEqualTo(StoryToolMode.TEXTURE)
        assertThat(vm.state.value.selectedSceneObject).isNull()
    }

    @Test
    fun `talkback hears Background selected, as VoiceOver does, when the Background tool selects it`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)

        compose.onNodeWithContentDescription(backgroundTool).performClick()

        compose.onNodeWithTag(EDITING_ANNOUNCER_TAG)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Background selected")))
    }

    @Test
    fun `the tool column is a container named Scene tools, as iOS names it`() {
        val vm = viewModel()
        show(vm)

        val column = compose.onNodeWithTag(SCENE_TOOL_COLUMN_TAG)
        column.assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Scene tools")))
        column.assert(SemanticsMatcher.expectValue(SemanticsProperties.IsTraversalGroup, true))
        compose.onNode(hasContentDescription(backgroundTool) and hasAnyAncestor(hasContentDescription("Scene tools"))).assertExists()
    }
}
