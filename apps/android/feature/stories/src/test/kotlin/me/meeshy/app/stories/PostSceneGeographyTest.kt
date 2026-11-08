package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
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
import me.meeshy.sdk.model.composer.ComposerFormat
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
 * #14457 — retour porteur : la story, le post et le réel montrent la MÊME interface du compositeur. Cocher Post ne bouge
 * aucun pixel de la scène au repos ni du socle ; le texte du post est une option du rail, au pied des outils, et un point
 * discret dit qu'un texte est posé.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class PostSceneGeographyTest {

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

    private data class Rest(val scene: Rect, val audience: Rect, val more: Rect)

    private fun composer(format: ComposerFormat, postText: String = ""): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also {
            it.onEnterComposer()
            it.onFormats(listOf(format), null)
            if (postText.isNotEmpty()) it.onPostTextChange(postText)
        }
    }

    private fun show(vm: StoryComposerViewModel, onMorePanel: (StoryMorePanel?) -> Unit = {}) {
        compose.setContent {
            MeeshyTheme(darkTheme = true) {
                CompositionLocalProvider(LocalReduceMotion provides true) {
                    Box(Modifier.size(width = 360.dp, height = 692.dp)) {
                        val state by vm.state.collectAsState()
                        StoryComposerSceneFirst(
                            state = state,
                            viewModel = vm,
                            sceneExport = SceneExportHost(emptyList(), false) {},
                            doors = StoryComposerDoors(onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = {}),
                            morePanel = null,
                            onMorePanel = onMorePanel,
                            formatChevron = {},
                        )
                    }
                }
            }
        }
        compose.waitForIdle()
    }

    private fun bounds(description: String): Rect = compose.onNodeWithContentDescription(description).fetchSemanticsNode().boundsInRoot

    private fun rest(canvas: String): Rest = Rest(bounds(canvas), bounds("Audience"), bounds("More options"))

    @Test
    fun `checking Post moves no pixel of the scene, the socle nor the column foot`() {
        val vm = composer(ComposerFormat.STORY)
        show(vm)
        val story = rest("Story canvas — pinch to zoom, drag to pan")

        vm.onFormats(listOf(ComposerFormat.POST), null)
        compose.waitForIdle()
        val post = rest("Post canvas — pinch to zoom, drag to pan")

        assertThat(post.scene).isEqualTo(story.scene)
        assertThat(post.audience).isEqualTo(story.audience)
        assertThat(post.more.left).isEqualTo(story.more.left)
    }

    @Test
    fun `the post text is a round option of the rail, on the scene's tool column, never a bar of the socle`() {
        show(composer(ComposerFormat.POST))

        val option = bounds("Post text")
        val more = bounds("More options")
        val audience = bounds("Audience")
        val density = compose.density.density
        assertThat(option.width).isAtMost(48f * density + 1f)
        assertThat(option.left).isWithin(1f).of(more.left)
        assertThat(option.bottom).isAtMost(more.top + 1f)
        assertThat(option.bottom).isAtMost(audience.top)
    }

    @Test
    fun `a story offers no post text option`() {
        show(composer(ComposerFormat.STORY))

        compose.onNodeWithContentDescription("Post text").assertDoesNotExist()
    }

    @Test
    fun `a written post text is said by the option, discreetly`() {
        show(composer(ComposerFormat.POST, postText = "Au marché ce matin"))

        val node = compose.onNodeWithContentDescription("Post text").fetchSemanticsNode()
        assertThat(node.config.getOrElseNullable(SemanticsProperties.StateDescription) { null }).isEqualTo("Au marché ce matin")
    }

    @Test
    fun `touching the option opens the post text above the keyboard`() {
        var opened: StoryMorePanel? = null
        show(composer(ComposerFormat.POST)) { opened = it }

        compose.onNodeWithContentDescription("Post text").performClick()

        assertThat(opened).isEqualTo(StoryMorePanel.POST_TEXT)
    }
}
