package me.meeshy.app.stories

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Dp
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
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.capture.SceneQuickCapture
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
import org.robolectric.annotation.GraphicsMode

/**
 * #14496 — la ligne « Touchez pour la caméra · maintenez pour filmer » se pose, comme sur iOS, dans la zone libre de la
 * scène : centrée, à l'écart du rail. Elle ne recouvre aucun contrôle — ni la colonne d'outils (« Texte du post » et ⋯ à
 * son pied), ni le socle — sur le plus étroit des téléphones comme sur le S8.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SceneCaptureHintClearanceTest {

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

    private fun composer(format: ComposerFormat): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also {
            it.onEnterComposer()
            it.onFormats(listOf(format), null)
        }
    }

    private fun capture() = StorySceneCapture(
        offer = SceneQuickCapture.Offer(allowsPhoto = true, allowsVideo = true),
        onCaptured = {},
        viewfinder = { _, _ -> Text("viewfinder") },
    )

    private fun show(format: ComposerFormat, width: Dp, height: Dp) {
        val vm = composer(format)
        compose.setContent {
            MeeshyTheme(darkTheme = true) {
                CompositionLocalProvider(LocalReduceMotion provides true) {
                    Box(Modifier.size(width = width, height = height)) {
                        val state by vm.state.collectAsState()
                        StoryComposerSceneFirst(
                            state = state,
                            viewModel = vm,
                            sceneExport = SceneExportHost(emptyList(), false) {},
                            doors = StoryComposerDoors(onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = {}),
                            morePanel = null,
                            onMorePanel = {},
                            formatChevron = {},
                            capture = capture(),
                        )
                    }
                }
            }
        }
        compose.waitForIdle()
    }

    private fun bounds(description: String): Rect =
        compose.onAllNodesWithContentDescription(description).fetchSemanticsNodes().first().boundsInRoot

    private fun hint(): Rect = compose.onNodeWithText(string(R.string.composer_capture_hint_tap_or_hold)).fetchSemanticsNode().boundsInRoot

    /** Tout contrôle nommé posé sur la scène au repos, la scène elle-même exceptée. */
    private fun controls(scene: Rect): List<Rect> =
        compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.ContentDescription)).fetchSemanticsNodes()
            .map { it.boundsInRoot }
            .filter { it.width > 0f && it.height > 0f }
            .filterNot { it.width >= scene.width * 0.9f && it.height >= scene.height * 0.9f }

    private fun assertHintClearsEveryControl(format: ComposerFormat, width: Dp, height: Dp) {
        show(format, width, height)
        val scene = bounds(canvasLabel(format))
        val hint = hint()

        val controls = controls(scene)
        val overlapping = controls.filter { it.overlaps(hint) }

        assertThat(controls.size).isAtLeast(8)
        assertThat(overlapping).isEmpty()
        assertThat(hint.left).isAtLeast(scene.left)
        assertThat(hint.right).isAtMost(scene.right)
    }

    private fun canvasLabel(format: ComposerFormat): String =
        string(if (format == ComposerFormat.POST) R.string.stories_composer_canvas_post else R.string.stories_composer_canvas)

    @Test
    @Config(sdk = [34], qualifiers = "fr-w360dp-h740dp")
    fun `on the S8 under the account banner, the camera line of a post covers neither the tool column foot nor the socle`() {
        assertHintClearsEveryControl(ComposerFormat.POST, 360.dp, 545.dp)
    }

    @Test
    @Config(sdk = [34], qualifiers = "fr-w360dp-h740dp")
    fun `on a 360 dp phone, the camera line of a post covers no control`() {
        assertHintClearsEveryControl(ComposerFormat.POST, 360.dp, 692.dp)
    }

    @Test
    @Config(sdk = [34], qualifiers = "fr-w360dp-h740dp")
    fun `the camera line of a story covers no control either`() {
        assertHintClearsEveryControl(ComposerFormat.STORY, 360.dp, 545.dp)
    }

    private fun invite(): Rect = compose.onNodeWithText(string(R.string.composer_scene_invite)).fetchSemanticsNode().boundsInRoot

    @Test
    @Config(sdk = [34], qualifiers = "w411dp-h891dp")
    fun `the invite and the camera line sit together in the free middle of the scene, as on iOS`() {
        show(ComposerFormat.POST, 411.dp, 846.dp)
        val scene = bounds(canvasLabel(ComposerFormat.POST))
        val invite = invite()
        val hint = hint()
        val block = Rect(minOf(invite.left, hint.left), invite.top, maxOf(invite.right, hint.right), hint.bottom)

        assertThat(block.center.x).isWithin(2f).of(scene.center.x)
        assertThat(block.center.y).isWithin(2f).of(scene.center.y)
    }

    @Test
    @Config(sdk = [34], qualifiers = "fr-w360dp-h740dp")
    fun `on the S8 the camera line reads under the invite, never on top of it (#16204)`() {
        show(ComposerFormat.STORY, 360.dp, 545.dp)
        val invite = invite()
        val hint = hint()

        assertThat(invite.overlaps(hint)).isFalse()
        assertThat(hint.top).isAtLeast(invite.bottom)
    }

    @Test
    @Config(sdk = [34], qualifiers = "fr-w360dp-h740dp")
    fun `a post shows the same invite and camera line as the story (#16204)`() {
        show(ComposerFormat.POST, 360.dp, 545.dp)

        assertThat(invite().overlaps(hint())).isFalse()
    }
}
