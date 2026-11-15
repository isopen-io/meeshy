package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.click
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onRoot
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
 * #14700 — désélectionner un objet rend les outils à la colonne, et le premier toucher sur ♪ ouvre le son, même pendant que
 * la colonne change de rôle : les outils sont touchables à leur place dès qu'ils reviennent, comme sur iOS, où la bascule
 * n'est qu'un fondu.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class SceneRailSwapTouchTest {

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

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        ).also { it.onEnterComposer() }
    }

    private fun show(vm: StoryComposerViewModel, onSoundShelf: () -> Unit) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 360.dp, height = 692.dp)) {
                    val state by vm.state.collectAsState()
                    StoryComposerSceneFirst(
                        state = state,
                        viewModel = vm,
                        sceneExport = SceneExportHost(emptyList(), false) {},
                        doors = StoryComposerDoors(onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = onSoundShelf),
                        morePanel = null,
                        onMorePanel = {},
                        formatChevron = null,
                        keyboard = FixedTypingKeyboard(280f),
                    )
                }
            }
        }
    }

    private fun soundShelvesAfterTouchingSound(framesAfterDeselection: Int): Int {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onSceneBackgroundTap()
        var shelves = 0
        show(vm) { shelves++ }
        val sound = compose.onNodeWithContentDescription("Add sound").getUnclippedBoundsInRoot()
        val centre = with(compose.density) { Offset(((sound.left + sound.right) / 2).toPx(), ((sound.top + sound.bottom) / 2).toPx()) }

        compose.runOnUiThread { vm.onSelectSticker(vm.state.value.deck.selectedSlide.stickers.single().id) }
        compose.waitForIdle()
        compose.mainClock.autoAdvance = false
        compose.runOnUiThread { vm.onSceneBackgroundTap() }
        repeat(framesAfterDeselection) { compose.mainClock.advanceTimeByFrame() }
        compose.onRoot().performTouchInput { click(centre) }
        compose.mainClock.autoAdvance = true
        compose.waitForIdle()

        assertThat(vm.state.value.selectedSceneObject).isNull()
        return shelves
    }

    @Test
    fun `the first touch on Sound just after a deselection opens the sound`() {
        assertThat(soundShelvesAfterTouchingSound(framesAfterDeselection = 2)).isEqualTo(1)
    }

    @Test
    fun `the first touch on Sound while the tools come back opens the sound`() {
        assertThat(soundShelvesAfterTouchingSound(framesAfterDeselection = 8)).isEqualTo(1)
    }

    @Test
    fun `once the tools are back, a touch on Sound opens the sound`() {
        assertThat(soundShelvesAfterTouchingSound(framesAfterDeselection = 40)).isEqualTo(1)
    }
}
