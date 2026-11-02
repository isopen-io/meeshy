package me.meeshy.app.stories

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
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
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerFormat
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
 * #13913 — la scène nomme le format qu'elle compose : la toile s'annonce « du post » ou « du réel » au lecteur d'écran, le
 * socle dit « Texte du réel » sous un réel ; une story n'en dit rien d'autre que « story ».
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
class ComposerFormatLabelsComposeTest {

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

    private fun viewModel(format: ComposerFormat): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "en"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also {
            it.onEnterComposer()
            it.onFormat(format, null)
        }
    }

    private fun show(vm: StoryComposerViewModel) {
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
                    )
                }
            }
        }
    }

    @Test
    fun `a post announces the canvas of the post, never of the story`() {
        show(viewModel(ComposerFormat.POST))

        compose.onNodeWithContentDescription(string(R.string.stories_composer_canvas_post)).assertExists()
        compose.onNodeWithContentDescription(string(R.string.stories_composer_canvas)).assertDoesNotExist()
        compose.onNodeWithContentDescription(string(R.string.composer_post_text)).assertExists()
    }

    @Test
    fun `a reel announces its canvas and writes the text of the reel`() {
        show(viewModel(ComposerFormat.REEL))

        compose.onNodeWithContentDescription(string(R.string.stories_composer_canvas_reel)).assertExists()
        compose.onNodeWithContentDescription(string(R.string.composer_post_text_reel)).assertExists()
        compose.onNodeWithContentDescription(string(R.string.composer_post_text)).assertDoesNotExist()
    }

    @Test
    fun `a story announces the canvas of the story and writes no post text`() {
        show(viewModel(ComposerFormat.STORY))

        compose.onNodeWithContentDescription(string(R.string.stories_composer_canvas)).assertExists()
        compose.onNodeWithContentDescription(string(R.string.stories_composer_canvas_post)).assertDoesNotExist()
        compose.onNodeWithContentDescription(string(R.string.composer_post_text)).assertDoesNotExist()
    }
}
