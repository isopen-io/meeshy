package me.meeshy.app.stories

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.assertIsDisplayed
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerFormat
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
import java.io.File

/**
 * En POST, le « ⋯ » du rail reste joignable au-dessus de « Texte du post » (#14282, recette S8) : le plus court des
 * téléphones, la colonne entière d'outils, et le champ du post au socle.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PostRailReachTest {

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

    private fun postComposer(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also {
            it.onEnterComposer()
            it.onFormats(listOf(ComposerFormat.POST), null)
            // La recette S8 : un objet posé (↶ apparaît dans la barre du haut) et une seconde diapo (la rangée des diapos).
            it.onSceneReduce { s -> StoryComposerStickerReducer.added(s, "😀", "s1") }
            it.onSceneReduce { s -> StoryComposerStickerReducer.deselected(s) }
            it.onAddSlide()
        }
    }

    @Test
    fun `le dernier bouton du rail se touche au-dessus du champ du post`() {
        val vm = postComposer()
        var view: android.view.View? = null
        compose.setContent {
            view = LocalView.current
            MeeshyTheme(darkTheme = true) {
                CompositionLocalProvider(LocalReduceMotion provides true) {
                    Box(Modifier.size(width = 360.dp, height = 668.dp)) {
                        val state by vm.state.collectAsState()
                        StoryComposerSceneFirst(
                            state = state,
                            viewModel = vm,
                            sceneExport = SceneExportHost(emptyList(), false) {},
                            doors = StoryComposerDoors(
                                onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = {},
                                onReplaceBackground = { _, _ -> },
                            ),
                            morePanel = null,
                            onMorePanel = {},
                            formatChevron = {},
                        )
                    }
                }
            }
        }
        compose.waitForIdle()
        System.getenv("RAIL_SHOT")?.let { path ->
            val root = view!!.rootView
            val bmp = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
            root.draw(android.graphics.Canvas(bmp))
            File(path).outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }

        val more = compose.onNodeWithContentDescription("More options")
        // Sans défiler : sur le S8 rien ne dit que la colonne défile, le « ⋯ » doit se voir tel quel.
        more.assertIsDisplayed()
        val pill = compose.onNodeWithContentDescription("Post text").getUnclippedBoundsInRoot()
        assertThat(more.getUnclippedBoundsInRoot().bottom.value).isAtMost(pill.top.value)
    }
}
