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
import me.meeshy.ui.accessibility.LocalReduceMotion
import androidx.compose.ui.test.performScrollTo
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
import androidx.compose.ui.test.pinch
import me.meeshy.sdk.model.composer.ComposerSelectionSubject
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundSource
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectMenu
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #15194, côté compositeur : recadrer un média posé garde la scène en plein écran, les proportions par préréglages posées
 * par-dessus elle ; le pincement et le glisser placent l'image sous un cadre fixe, et un préréglage choisi y glisse le cadre.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class ComposerCropFullSceneComposeTest {

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

    private fun show(vm: StoryComposerViewModel, reduceMotion: Boolean = true) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides reduceMotion, LocalStickerLift provides StickerLiftSource { _, _ -> null }) {
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
        compose.waitForIdle()
    }

    private fun cropping(reduceMotion: Boolean = true): StoryComposerViewModel {
        val vm = viewModel()
        val media = UploadedMedia(id = "m1", url = "https://cdn/m1", mimeType = "image/jpeg", fileSize = 1, width = 1080, height = 1920, durationMs = null, thumbnailUrl = "https://cdn/t")
        vm.onSceneReduce { state ->
            val slide = state.deck.selectedSlide
            val loaded = state.copy(
                deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) it.copy(mediaIds = listOf("m1")) else it }),
                attachments = listOf(media),
            )
            StoryComposerSelectionReducer.mediaSelected(StoryComposerPlacedMediaReducer.placed(loaded, "m1"), "m1")
        }
        show(vm, reduceMotion)
        compose.onNodeWithText("Crop").performScrollTo().performClick()
        compose.waitForIdle()
        return vm
    }

    private fun placed(vm: StoryComposerViewModel) = vm.state.value.deck.selectedSlide.placedMedia.single()

    private fun bounds(tag: String) = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot

    @Test
    fun `cropping keeps the scene full, the presets laid over it`() {
        cropping()

        val scene = compose.onNodeWithContentDescription(canvas).fetchSemanticsNode().boundsInRoot
        val band = bounds(PLACED_BAND_TAG)
        assertThat(scene.width).isWithin(1f).of(360f * compose.density.density)
        assertThat(scene.height).isWithin(1f).of(640f * compose.density.density)
        assertThat(band.top).isLessThan(scene.bottom)
        compose.onNodeWithText("1:1").assertExists()
    }

    @Test
    fun `pinching zooms the image under the frame, its pose and its proportions untouched`() {
        val vm = cropping()
        compose.onNodeWithText("1:1").performClick()
        compose.waitForIdle()
        val framed = placed(vm)
        val frame = bounds("placed-media")

        compose.onNodeWithTag("placed-media").performTouchInput {
            pinch(center - Offset(10f, 0f), center - Offset(60f, 0f), center + Offset(10f, 0f), center + Offset(60f, 0f))
        }
        compose.waitForIdle()

        val after = placed(vm)
        assertThat(after.crop!!.width).isLessThan(framed.crop!!.width)
        assertThat(after.crop!!.width / after.crop!!.height).isWithin(1e-6).of(framed.crop!!.width / framed.crop!!.height)
        assertThat(after.x to after.y).isEqualTo(framed.x to framed.y)
        assertThat(after.scale).isEqualTo(framed.scale)
        assertThat(bounds("placed-media").width).isWithin(1f).of(frame.width)
    }

    @Test
    fun `choosing a preset glides the frame to its new proportions`() {
        cropping(reduceMotion = false)
        val start = bounds("placed-media")
        compose.mainClock.autoAdvance = false

        compose.onNodeWithText("1:1").performClick()
        compose.mainClock.advanceTimeBy(120)
        val midway = bounds("placed-media")
        compose.mainClock.advanceTimeBy(1_000)
        val end = bounds("placed-media")
        compose.mainClock.autoAdvance = true

        assertThat(end.height).isLessThan(start.height - 1f)
        assertThat(midway.height).isLessThan(start.height)
        assertThat(midway.height).isGreaterThan(end.height)
    }
}
