package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkManager
import coil.Coil
import coil.ImageLoader
import coil.intercept.Interceptor
import coil.request.ErrorResult
import coil.request.ImageResult
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
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.media.COMPOSER_LIVE_VIDEO_TAG
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La scène vit (#13863, directive porteur du 2026-10-31 : « la scène totalement dynamique et temps réel ») : la vidéo de fond
 * et les vidéos posées jouent sur la scène sans qu'on les sélectionne ; sélectionner ne fait que désigner ce qu'on édite.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class ComposerLiveSceneComposeTest {

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

    private fun show(vm: StoryComposerViewModel) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides true) {
                    Box(Modifier.size(width = 360.dp, height = 692.dp)) {
                        val state by vm.state.collectAsState()
                        CompositionLocalProvider(LocalComposerLive provides rememberComposerLive(state, vm, shelfOpen = false)) {
                            StoryComposerSceneFirst(
                                state = state,
                                viewModel = vm,
                                sceneExport = SceneExportHost(emptyList(), false) {},
                                doors = StoryComposerDoors(onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = {}),
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
    }

    private fun withMedia(vm: StoryComposerViewModel, mime: String, placed: Boolean = false) {
        val media = UploadedMedia(id = "m", url = "file:///sdcard/m.mp4", mimeType = mime, fileSize = 1, width = 1080, height = 1920, durationMs = 8_000, thumbnailUrl = null)
        vm.onSceneReduce { state ->
            val slide = state.deck.selectedSlide
            val next = slide.copy(mediaIds = listOf("m"), placedMedia = if (placed) listOf(StoryPlacedMedia(mediaId = "m", id = "p")) else emptyList())
            state.copy(deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) next else it }), attachments = listOf(media))
        }
    }

    private val background = hasTestTag(COMPOSER_LIVE_VIDEO_TAG) and !hasAnyAncestor(hasTestTag("placed-media"))

    private val placedVideo = hasTestTag(COMPOSER_LIVE_VIDEO_TAG) and hasAnyAncestor(hasTestTag("placed-media"))

    @Test
    fun `the background video plays on the scene with nothing selected`() {
        val vm = viewModel()
        withMedia(vm, "video/mp4")
        show(vm)

        compose.onNode(background, useUnmergedTree = true).assertExists()
    }

    @Test
    fun `a background photo has no live player`() {
        val vm = viewModel()
        withMedia(vm, "image/jpeg")
        show(vm)

        compose.onNodeWithTag(COMPOSER_LIVE_VIDEO_TAG, useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `selecting then deselecting the background never stops it`() {
        val vm = viewModel()
        withMedia(vm, "video/mp4")
        show(vm)
        compose.onNodeWithContentDescription(canvas).performTouchInput { longClick(Offset(width * 0.5f, height * 0.5f)) }

        vm.onSceneReduce(StoryComposerSelectionReducer::cleared)
        compose.waitForIdle()

        compose.onNode(background, useUnmergedTree = true).assertExists()
    }

    @Test
    fun `a placed video plays in its own frame with nothing selected`() {
        val vm = viewModel()
        withMedia(vm, "video/mp4", placed = true)
        show(vm)

        compose.onNode(placedVideo, useUnmergedTree = true).assertExists()
    }
}
