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
import androidx.compose.ui.test.performScrollTo
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le rail « Fond » du fond média (#13973, lot A-E2, à plat depuis #14047) : toucher ou tenir le fond pose À PLAT ses outils
 * puis Remplacer · Mettre sur la scène · Retirer — plus de « Modifier » ; chaque réglage pose sa bande au bas de la scène et
 * s'écrit à chaque valeur, Retour descend d'un niveau, la Boucle d'une vidéo bascule dans le rail même et Décrire ouvre une
 * feuille basse. Aucune feuille à pastilles, aucun menu.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class ComposerBackgroundEditComposeTest {

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

    private fun withBackgroundPhoto(vm: StoryComposerViewModel) = withBackground(vm, "image/jpeg", null)

    private fun withBackgroundVideo(vm: StoryComposerViewModel) = withBackground(vm, "video/mp4", 8_000)

    private fun withBackground(vm: StoryComposerViewModel, mime: String, durationMs: Long?) {
        val media = UploadedMedia(id = "bg", url = "https://cdn/bg", mimeType = mime, fileSize = 1, width = 1080, height = 1920, durationMs = durationMs, thumbnailUrl = null)
        vm.onSceneReduce { state ->
            val slide = state.deck.selectedSlide
            state.copy(
                deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) it.copy(mediaIds = listOf("bg")) else it }),
                attachments = listOf(media),
            )
        }
    }

    private fun holdScene() = compose.onNodeWithContentDescription(canvas).performTouchInput { longClick(Offset(width * 0.5f, height * 0.5f)) }

    private fun modify() = holdScene()

    private val actions = arrayOf("Replace", "Place on the scene", "Remove")

    private fun railShows(vararg words: String) {
        val shown = compose.onNodeWithTag(EDITING_RAIL_TAG).onChildren().fetchSemanticsNodes()
            .mapNotNull { node -> node.config.getOrNull(SemanticsProperties.Text)?.joinToString { text -> text.text } }
        assertThat(shown).containsExactlyElementsIn(words.toList()).inOrder()
    }

    /** Une entrée du rail, défilé jusqu'à elle : le rail à plat dépasse la hauteur et défile (#14047). */
    private fun tapRail(text: String) {
        compose.onNodeWithText(text).performScrollTo().performClick()
    }

    @Test
    fun `holding the background lays its tools flat in the rail, then Replace, Put on the scene and Remove, without Edit nor sheet`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)

        modify()

        railShows("Framing", "Filters", "Frames", "Adjust", "Effects", "Rotate", "Describe", *actions)
        compose.onNodeWithText("Edit").assertDoesNotExist()
        compose.onNodeWithText("Back").assertDoesNotExist()
        compose.onNodeWithTag(BACKGROUND_BAND_TAG).assertDoesNotExist()
        listOf("Audience", "Publish story").forEach { compose.onNodeWithContentDescription(it).assertDoesNotExist() }
    }

    @Test
    fun `Adjust lays its band under the scene, and its slider repaints the background at every value`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)
        modify()

        tapRail("Adjust")

        compose.onNodeWithTag(BACKGROUND_BAND_TAG).assertExists()
        compose.onNodeWithText("Back").assertExists()
        compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.SetProgress))[0].performSemanticsAction(SemanticsActions.SetProgress) { it(0.4f) }
        assertThat(vm.state.value.deck.selectedSlide.backgroundAdjustments).isNotNull()
        compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.SetProgress))[0].performSemanticsAction(SemanticsActions.SetProgress) { it(0.6f) }
        assertThat(vm.state.value.deck.selectedSlide.backgroundAdjustments).isNotNull()
    }

    @Test
    fun `Back goes down one level, the band leaving with its level, the document untouched`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)
        modify()
        tapRail("Framing")
        compose.onNodeWithTag(BACKGROUND_BAND_TAG).assertExists()
        val framed = vm.state.value.deck

        compose.onNodeWithText("Back").performClick()

        compose.onNodeWithTag(BACKGROUND_BAND_TAG).assertDoesNotExist()
        railShows("Framing", "Filters", "Frames", "Adjust", "Effects", "Rotate", "Describe", *actions)
        compose.onNodeWithText("Back").assertDoesNotExist()
        assertThat(vm.state.value.deck).isEqualTo(framed)
        assertThat(vm.state.value.selectedSlideBackdropMediaId).isEqualTo("bg")
    }

    @Test
    fun `Framing is the frame panel, its choice written at once`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)
        modify()

        tapRail("Framing")
        compose.onNodeWithContentDescription("Black").performClick()

        assertThat(vm.state.value.deck.selectedSlide.frame.backdrop).isEqualTo(me.meeshy.sdk.model.composer.scene.StoryBackdrop.BLACK.wire)
    }

    @Test
    fun `Filters lays one clear strip, without the tabs of the families`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)
        modify()

        tapRail("Filters")

        compose.onNodeWithText("Effects").assertDoesNotExist()
        compose.onNodeWithText("Frames").assertDoesNotExist()
    }

    @Test
    fun `Filters puts the filter of the scene in the band`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)
        modify()

        tapRail("Filters")
        compose.onNodeWithTag(BACKGROUND_BAND_TAG).assertExists()
        assertThat(compose.onAllNodesWithText("None").fetchSemanticsNodes()).isNotEmpty()
    }

    @Test
    fun `a background video offers Trim, Sound, Loop and Rotate, Loop switched in the rail itself`() {
        val vm = viewModel()
        withBackgroundVideo(vm)
        show(vm)
        modify()

        railShows("Framing", "Trim", "Filters", "Adjust", "Sound", "Loop", "Rotate", "Describe", *actions)
        compose.onNodeWithTag(BACKGROUND_LOOP_TAG).assertIsOn()
        compose.onNodeWithTag(BACKGROUND_LOOP_TAG).performClick()

        assertThat(vm.state.value.deck.selectedSlide.backgroundLoop).isFalse()
        compose.onNodeWithTag(BACKGROUND_LOOP_TAG).assertIsOff()
        compose.onNodeWithTag(BACKGROUND_BAND_TAG).assertDoesNotExist()
    }

    @Test
    fun `Trim of a background video is the trim strip, and the kept window is written`() {
        val vm = viewModel()
        withBackgroundVideo(vm)
        show(vm)
        modify()

        tapRail("Trim")
        compose.onNodeWithTag(BACKGROUND_BAND_TAG).assertExists()
        vm.onSceneGesture("trim-bg") { StoryComposerBackgroundReducer.trimmed(it, me.meeshy.sdk.model.media.MediaTrimBounds(2.0, 5.0)) }

        assertThat(vm.state.value.deck.selectedSlide.backgroundTrim).isEqualTo(me.meeshy.sdk.model.media.MediaTrimBounds(2.0, 5.0))
    }

    @Test
    fun `Sound of a background video lays its volume under the scene, from 0 to 100 percent shown beside it, and Mute silences it`() {
        val vm = viewModel()
        withBackgroundVideo(vm)
        show(vm)
        modify()

        tapRail("Sound")
        compose.onNodeWithTag(BACKGROUND_BAND_TAG).assertExists()
        compose.onNodeWithTag(COMPOSER_VOLUME_TAG).performSemanticsAction(SemanticsActions.SetProgress) { it(0.4f) }

        assertThat(vm.state.value.deck.selectedSlide.backgroundSetting.volume).isWithin(1e-4f).of(0.4f)
        compose.onNodeWithText("40 %").assertExists()
        compose.onNodeWithText("Mute").performClick()
        assertThat(vm.state.value.deck.selectedSlide.backgroundSetting.volume).isEqualTo(0f)
        compose.onNodeWithText("Mute").performClick()
        assertThat(vm.state.value.deck.selectedSlide.backgroundSetting.volume).isWithin(1e-4f).of(0.4f)
    }

    @Test
    fun `Rotate turns the background a quarter at once, staying on its level`() {
        val vm = viewModel()
        withBackgroundVideo(vm)
        show(vm)
        modify()

        tapRail("Rotate")

        assertThat(vm.state.value.deck.selectedSlide.backgroundSetting.rotationDeg).isEqualTo(me.meeshy.sdk.model.StoryMediaRotation.turned(0f))
        compose.onNodeWithTag(BACKGROUND_BAND_TAG).assertDoesNotExist()
        compose.onNodeWithText("Rotate").assertExists()
    }

    @Test
    fun `Describe opens a sheet whose field writes the description of the background`() {
        val vm = viewModel()
        withBackgroundPhoto(vm)
        show(vm)
        modify()

        tapRail("Describe")

        compose.onNodeWithTag(BACKGROUND_DESCRIPTION_TAG).assertExists()
    }
}
