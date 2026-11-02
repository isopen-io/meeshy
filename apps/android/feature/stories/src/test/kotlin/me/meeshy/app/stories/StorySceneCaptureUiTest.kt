package me.meeshy.app.stories

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.clickable
import androidx.compose.material3.Text
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import me.meeshy.sdk.model.composer.capture.SceneQuickCapture
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
import me.meeshy.feature.stories.R
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
 * #13849 — la scène VIDE dit, d'une ligne, qu'un toucher ouvre la caméra ; le toucher arme le viseur DANS la scène et
 * retire tout le reste, le viseur fermé rend la scène ; l'appui long sur Média propose la caméra en premier. Le viseur
 * CameraX est remplacé par un témoin : ce sont la place et les gestes qui sont tenus ici, pas le matériel.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
class StorySceneCaptureUiTest {

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

    private fun string(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "en"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also { it.onEnterComposer() }
    }

    private val photoAndVideo = SceneQuickCapture.Offer(allowsPhoto = true, allowsVideo = true)

    private fun capture(offer: SceneQuickCapture.Offer? = photoAndVideo) = StorySceneCapture(
        offer = offer,
        onCaptured = {},
        viewfinder = { scene, modifier ->
            Box(modifier.testTag("scene-viewfinder")) {
                Text("close", Modifier.clickable { scene.disarm() })
            }
        },
    )

    private fun show(vm: StoryComposerViewModel, capture: StorySceneCapture) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 411.dp, height = 891.dp)) {
                    val state by vm.state.collectAsState()
                    StoryComposerSceneFirst(
                        state = state,
                        viewModel = vm,
                        sceneExport = SceneExportHost(emptyList(), false) {},
                        doors = StoryComposerDoors(onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = {}),
                        morePanel = null,
                        onMorePanel = {},
                        formatChevron = null,
                        capture = capture,
                    )
                }
            }
        }
    }

    @Test
    fun `a blank scene says in one line that a touch opens the camera, and a posed object takes the line away`() {
        val vm = viewModel()
        show(vm, capture())

        compose.onNodeWithText(string(R.string.composer_capture_hint_tap_or_hold)).assertIsDisplayed()

        vm.onAddSticker("🔥")
        compose.waitForIdle()

        compose.onNodeWithText(string(R.string.composer_capture_hint_tap_or_hold)).assertDoesNotExist()
    }

    @Test
    fun `touching the blank scene arms the viewfinder in the scene, alone, and closing it gives the scene back`() {
        val capture = capture()
        show(viewModel(), capture)

        compose.onNodeWithContentDescription(string(R.string.stories_composer_canvas)).performClick()

        assertThat(capture.armed).isTrue()
        compose.onNodeWithTag("scene-viewfinder").assertExists()
        compose.onNodeWithContentDescription(string(R.string.stories_scene_overflow_menu)).assertDoesNotExist()
        compose.onNodeWithText(string(R.string.composer_capture_hint_tap_or_hold)).assertDoesNotExist()

        compose.onNodeWithText("close").performClick()

        compose.onNodeWithTag("scene-viewfinder").assertDoesNotExist()
        compose.onNodeWithContentDescription(string(R.string.stories_scene_overflow_menu)).assertExists()
    }

    @Test
    fun `holding the blank scene arms the viewfinder already filming`() {
        val capture = capture()
        show(viewModel(), capture)

        compose.onNodeWithContentDescription(string(R.string.stories_composer_canvas)).performTouchInput { longClick() }

        assertThat(capture.armed).isTrue()
        assertThat(capture.filmsOnArm).isTrue()
    }

    /**
     * Le doigt qui a armé en tenant la scène reste suivi alors que le viseur l'a recouverte : glissé jusqu'au cadenas puis
     * levé, il est remis au viseur tel quel — verrouillé, levé — et la prise continuera sans lui (iOS `ComposerCaptureHold`).
     */
    @Test
    fun `the finger that armed by holding is followed under the viewfinder, its lock and its release reach the camera`() {
        val capture = capture()
        show(viewModel(), capture)

        compose.onNodeWithContentDescription(string(R.string.stories_composer_canvas)).performTouchInput {
            down(center)
            advanceEventTime(800)
            moveBy(androidx.compose.ui.geometry.Offset(x = 100.dp.toPx(), y = 0f))
            up()
        }
        val relayed = mutableListOf<me.meeshy.sdk.model.composer.capture.SceneHoldSignal>()
        capture.hold.attach { relayed += it }

        assertThat(capture.armed).isTrue()
        assertThat(capture.hold.holding).isFalse()
        assertThat(relayed.first()).isEqualTo(me.meeshy.sdk.model.composer.capture.SceneHoldSignal.Began)
        assertThat(relayed).contains(me.meeshy.sdk.model.composer.capture.SceneHoldSignal.Released)
        assertThat(relayed.filterIsInstance<me.meeshy.sdk.model.composer.capture.SceneHoldSignal.Moved>()).isNotEmpty()
    }

    @Test
    fun `a finger lifted at once after the hold leaves nothing for the camera to film`() {
        val capture = capture()
        show(viewModel(), capture)

        compose.onNodeWithContentDescription(string(R.string.stories_composer_canvas)).performTouchInput { longClick() }
        val relayed = mutableListOf<me.meeshy.sdk.model.composer.capture.SceneHoldSignal>()
        capture.hold.attach { relayed += it }

        assertThat(capture.hold.holding).isFalse()
        assertThat(relayed).isEmpty()
    }

    @Test
    fun `a door that promises video says only that holding films`() {
        show(viewModel(), capture(SceneQuickCapture.Offer(allowsPhoto = false, allowsVideo = true)))

        compose.onNodeWithText(string(R.string.composer_capture_hint_hold)).assertIsDisplayed()
    }

    @Test
    fun `without a viewfinder the scene says nothing and a touch arms nothing`() {
        val capture = capture(offer = null)
        show(viewModel(), capture)

        compose.onNodeWithContentDescription(string(R.string.stories_composer_canvas)).performClick()

        assertThat(capture.armed).isFalse()
        compose.onNodeWithText(string(R.string.composer_capture_hint_tap_or_hold)).assertDoesNotExist()
    }

    @Test
    fun `the long press on Media offers the scene camera first, and choosing it arms the viewfinder`() {
        val capture = capture()
        show(viewModel(), capture)

        compose.onNodeWithContentDescription(string(R.string.story_tool_media)).performTouchInput { longClick() }
        compose.onNodeWithText(string(R.string.composer_media_from_camera)).performClick()

        assertThat(capture.armed).isTrue()
    }
}
