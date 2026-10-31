package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.click
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
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
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
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
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.network.NetworkMonitor
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * R5 de #13863, sur le plateau : le média choisi se tient à sa place, sa progression annoncée à TalkBack ; pendant ce
 * temps un voile rend le reste inerte — au doigt comme au lecteur d'écran — et Publier se grise ; ✕ annule, un échec se
 * dit dans une ligne avec « Réessayer », un média hors ligne se pose « en attente », un sticker dont l'image part le dit.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class ComposerIncomingMediaComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val uploader: StoryMediaUploader = mockk<StoryMediaUploader>(relaxed = true).also { it.answersEachFromWhole() }
    private val queue: MediaUploadQueue = mockk(relaxed = true)

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

    private fun string(id: Int, vararg args: Any): String = ApplicationProvider.getApplicationContext<android.content.Context>().getString(id, *args)

    private val adding get() = string(me.meeshy.feature.stories.R.string.story_composer_incoming_a11y)

    private fun viewModel(network: NetworkMonitor? = null): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, uploader, queue,
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(), network = network,
        ).also { it.onEnterComposer() }
    }

    private fun show(vm: StoryComposerViewModel) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 360.dp, height = 692.dp)) {
                    val state by vm.state.collectAsState()
                    StoryComposerSceneFirst(
                        state = state,
                        viewModel = vm,
                        sceneExport = SceneExportHost(emptyList(), false) {},
                        doors = StoryComposerDoors(onClose = {}, onOpenAudience = {}, onOpenStickers = {}, onPickMedia = {}, onOpenSoundShelf = {}),
                        morePanel = null,
                        onMorePanel = {},
                        formatChevron = null,
                        keyboard = FixedTypingKeyboard(280f),
                    )
                }
            }
        }
    }

    private fun photo() = MediaUploadItem(byteArrayOf(1, 2, 3, 4), "a.jpg", "image/jpeg")

    private fun uploaded(id: String) = UploadedMedia(id, "https://cdn/$id", "image/jpeg", 1, 1, 1, null, null)

    private fun hanging(report: ((Int, Long, Long) -> Unit) -> Unit = {}) {
        coEvery { uploader.upload(any(), any()) } coAnswers {
            report(secondArg())
            CompletableDeferred<Unit>().await()
            NetworkResult.Success(emptyList())
        }
    }

    @Test
    fun `the picked media stands on the scene preparing, then its ring follows the bytes, both announced`() {
        var report: ((Int, Long, Long) -> Unit)? = null
        hanging { report = it }
        val vm = viewModel()
        show(vm)

        vm.onMediaPicked(listOf(photo()))
        compose.waitForIdle()

        compose.onNodeWithContentDescription(adding)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.ProgressBarRangeInfo, ProgressBarRangeInfo.Indeterminate))
        compose.onNodeWithText(string(me.meeshy.feature.stories.R.string.story_composer_incoming_preparing)).assertExists()

        report!!(0, 2L, 4L)
        compose.waitForIdle()

        compose.onNodeWithContentDescription(adding)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.ProgressBarRangeInfo, ProgressBarRangeInfo(0.5f, 0f..1f)))
        compose.onNodeWithText(string(me.meeshy.feature.stories.R.string.story_composer_incoming_sending, 50)).assertExists()
    }

    @Test
    fun `while it loads the tools and publish are out of reach, even for TalkBack`() {
        hanging()
        val vm = viewModel()
        show(vm)
        compose.onNodeWithContentDescription("Text").assertExists()

        vm.onMediaPicked(listOf(photo()))
        compose.waitForIdle()

        compose.onNodeWithContentDescription("Text").assertDoesNotExist()
        compose.onNodeWithText("Publish story").assertDoesNotExist()
        assertThat(vm.state.value.canPublish).isFalse()
    }

    @Test
    fun `the cross cancels the pick and frees the screen at once`() {
        hanging()
        val vm = viewModel()
        show(vm)
        vm.onMediaPicked(listOf(photo()))
        compose.waitForIdle()

        compose.onNodeWithContentDescription(string(me.meeshy.feature.stories.R.string.story_composer_incoming_cancel)).performClick()

        compose.onNodeWithContentDescription(adding).assertDoesNotExist()
        compose.onNodeWithContentDescription("Text").assertExists()
        assertThat(vm.state.value.isUploadingMedia).isFalse()
        assertThat(vm.state.value.deck.selectedSlide.mediaIds).isEmpty()
    }

    @Test
    fun `a failure is said in a discreet line whose retry sends the same media again`() {
        var attempts = 0
        coEvery { uploader.upload(any(), any()) } coAnswers {
            attempts++
            if (attempts == 1) throw IllegalStateException("boom") else NetworkResult.Success(listOf(uploaded("m1")))
        }
        val vm = viewModel()
        show(vm)
        vm.onMediaPicked(listOf(photo()))
        compose.waitForIdle()

        compose.onNodeWithContentDescription(adding).assertDoesNotExist()
        compose.onNodeWithText(string(me.meeshy.feature.stories.R.string.story_composer_incoming_failed)).assertExists()
        compose.onNodeWithText(string(me.meeshy.feature.stories.R.string.story_composer_incoming_retry)).performClick()

        assertThat(attempts).isEqualTo(2)
        assertThat(vm.state.value.selectedSlideBackdropMediaId).isEqualTo("m1")
        compose.onNodeWithText(string(me.meeshy.feature.stories.R.string.story_composer_incoming_retry)).assertDoesNotExist()
    }

    @Test
    fun `offline the background and a posed media wait on the scene, and the screen stays usable`() {
        coEvery { uploader.upload(any(), any()) } returns NetworkResult.Failure(ApiError(message = "offline"))
        var next = 0
        coEvery { queue.enqueue(any(), any(), any()) } answers { "cmid_${++next}" }
        val vm = viewModel(network = InMemoryNetworkMonitor(initialOnline = false))
        show(vm)

        vm.onMediaPicked(listOf(photo()))
        vm.onMediaPicked(listOf(photo()))
        compose.waitForIdle()

        val waiting = string(me.meeshy.feature.stories.R.string.story_composer_incoming_waiting)
        assertThat(compose.onAllNodesWithText(waiting).fetchSemanticsNodes()).hasSize(2)
        assertThat(vm.state.value.isUploadingMedia).isFalse()
        compose.onNodeWithTag(EDITING_RAIL_TAG).assertExists()
        compose.runOnIdle { vm.onSceneBackgroundTap() }
        compose.onNodeWithText("Publish story").assertExists()
    }

    @Test
    fun `online, a media whose upload failed never says waiting on the scene, it says Failed — Retry and the line offers it`() {
        coEvery { uploader.upload(any(), any()) } returns NetworkResult.Failure(ApiError(message = "timeout", code = "NETWORK"))
        coEvery { queue.enqueue(any(), any(), any()) } returns "cmid_1"
        val vm = viewModel(network = InMemoryNetworkMonitor(initialOnline = true))
        show(vm)

        vm.onMediaPicked(listOf(photo()))
        compose.waitForIdle()

        val waiting = string(me.meeshy.feature.stories.R.string.story_composer_incoming_waiting)
        val failed = string(me.meeshy.feature.stories.R.string.story_composer_upload_failed_retry)
        assertThat(compose.onAllNodesWithText(waiting).fetchSemanticsNodes()).isEmpty()
        assertThat(compose.onAllNodesWithText(failed).fetchSemanticsNodes()).isNotEmpty()
        compose.onNodeWithText(string(me.meeshy.feature.stories.R.string.story_composer_incoming_retry)).assertExists()
    }

    @Test
    fun `a sticker whose image is still on its way says so on the scene`() {
        val vm = viewModel()
        vm.onSceneReduce { s ->
            StoryComposerStickerReducer.posed(s, StoryStickerElement(id = "st", imageUrl = "file:///tmp/st.png"))
        }
        show(vm)

        compose.onNodeWithContentDescription(adding)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.ProgressBarRangeInfo, ProgressBarRangeInfo.Indeterminate))
    }

    @Test
    fun `under the veil a touch on a tool does nothing, while the cross still answers`() {
        var tapped = 0
        var cancelled = 0
        var busy by mutableStateOf(false)
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 360.dp, height = 692.dp)) {
                    StorySceneFirstLayout(
                        onDismiss = {},
                        reduced = false,
                        scene = { modifier -> Box(modifier) },
                        top = {},
                        trailing = { TextButton(onClick = { tapped++ }, modifier = Modifier.testTag("tool")) { Text("T") } },
                        panel = {},
                        socle = {},
                        incoming = if (busy) ({ IncomingCancel(onCancel = { cancelled++ }) }) else null,
                    )
                }
            }
        }
        val tool = compose.onNodeWithTag("tool").getUnclippedBoundsInRoot()
        val at = Offset(((tool.left + tool.right) / 2).value * compose.density.density, ((tool.top + tool.bottom) / 2).value * compose.density.density)

        busy = true
        compose.waitForIdle()
        compose.onRoot().performTouchInput { click(at) }
        compose.onNodeWithContentDescription(string(me.meeshy.feature.stories.R.string.story_composer_incoming_cancel)).performClick()

        assertThat(tapped).isEqualTo(0)
        assertThat(cancelled).isEqualTo(1)
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithText(text: String) =
        onAllNodes(androidx.compose.ui.test.hasText(text))
}
