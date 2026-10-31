package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewModelScope
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
import kotlinx.coroutines.cancel
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
import me.meeshy.sdk.story.StoryComposerDraftStore
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
 * Les portes du rail ouvrent leur feuille dans tous les états du compositeur (#13910) : toucher Sticker montre la feuille
 * Stickers, Son l'étagère des sons, sur une scène neuve comme sur un brouillon de post repris après la mort du processus
 * (deux médias posés, texte du post). Sur l'APK de 122675f5e2, la feuille Stickers était aussitôt relâchée comme une feuille
 * de sélection périmée : `serves` ne la servait que si un LIEU était sélectionné.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class StoryComposerToolDoorsTest {

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

    private fun viewModel(store: StoryComposerDraftStore = InMemoryStoryComposerDraftStore()): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), store, mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
        )
    }

    private fun media(id: String) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = "image/jpeg", fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)

    /** Le brouillon du S8 : deux médias posés et le texte du post, écrit puis relu par un compositeur neuf. */
    private fun resumedPostDraft(): StoryComposerViewModel {
        val store = InMemoryStoryComposerDraftStore()
        val killed = viewModel(store).also { it.onEnterComposer() }
        killed.onSceneReduce { state ->
            val slide = state.deck.selectedSlide.copy(
                mediaIds = listOf("m1", "m2"),
                placedMedia = listOf(StoryPlacedMedia("m1", x = 0.3f, y = 0.4f, zIndex = 1), StoryPlacedMedia("m2", x = 0.6f, y = 0.7f, zIndex = 2)),
            )
            state.copy(deck = state.deck.copy(slides = listOf(slide)), attachments = listOf(media("m1"), media("m2")))
        }
        killed.onPostTextChange("le texte du post")
        killed.persistDraft()
        killed.viewModelScope.cancel()
        return viewModel(store).also { it.onEnterComposer() }
    }

    /** Le branchement de l'écran : les portes posent la feuille, l'hôte la montre — comme `StoryComposerScreen`. */
    private fun show(vm: StoryComposerViewModel) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 360.dp, height = 692.dp)) {
                    val state by vm.state.collectAsState()
                    var sheet by remember { mutableStateOf<StoryComposerSheet?>(null) }
                    StoryComposerSceneFirst(
                        state = state,
                        viewModel = vm,
                        sceneExport = SceneExportHost(emptyList(), false) {},
                        doors = StoryComposerDoors(
                            onClose = {},
                            onOpenAudience = { sheet = StoryComposerSheet.AUDIENCE },
                            onOpenStickers = { sheet = StoryComposerSheet.STICKERS },
                            onPickMedia = {},
                            onOpenSoundShelf = { sheet = StoryComposerSheet.SOUND },
                        ),
                        morePanel = null,
                        onMorePanel = {},
                        formatChevron = null,
                        sheet = StorySheetSlot(open = sheet, onDismiss = { sheet = null }, onOpen = { sheet = it }) { open -> Text("sheet:$open") },
                        keyboard = FixedTypingKeyboard(280f),
                    )
                }
            }
        }
    }

    private fun assertToolOpens(vm: StoryComposerViewModel, tool: String, sheet: StoryComposerSheet) {
        show(vm)
        compose.onNodeWithContentDescription(tool).performClick()
        compose.waitForIdle()
        compose.onNodeWithText("sheet:$sheet").assertExists()
    }

    @Test
    fun `Sticker opens the stickers sheet on a fresh scene`() =
        assertToolOpens(viewModel().also { it.onEnterComposer() }, "Sticker", StoryComposerSheet.STICKERS)

    @Test
    fun `Sticker opens the stickers sheet on a post draft resumed after process death`() {
        val vm = resumedPostDraft()
        assertThat(vm.state.value.deck.selectedSlide.placedMedia.map { it.mediaId }).containsExactly("m1", "m2")
        assertThat(vm.state.value.postText).isEqualTo("le texte du post")
        assertToolOpens(vm, "Sticker", StoryComposerSheet.STICKERS)
    }

    @Test
    fun `Sticker opens the stickers sheet again after a selection was cleared`() {
        val vm = viewModel().also { it.onEnterComposer() }
        vm.onAddSticker("😀")
        show(vm)
        compose.onNodeWithContentDescription(canvas).performTouchInput { click(Offset(width * 0.15f, height * 0.35f)) }
        compose.onNodeWithContentDescription("Sticker").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("sheet:${StoryComposerSheet.STICKERS}").assertExists()
    }

    @Test
    fun `Sound opens the sound shelf on a fresh scene`() =
        assertToolOpens(viewModel().also { it.onEnterComposer() }, "Sound", StoryComposerSheet.SOUND)

    @Test
    fun `the sheets that serve no selection are served with nothing selected`() {
        val state = viewModel().also { it.onEnterComposer() }.state.value
        val (selectionSheets, doors) = StoryComposerSheet.entries.partition { it.servesSelection }
        assertThat(doors.filterNot(state::serves)).isEmpty()
        assertThat(selectionSheets.filter(state::serves)).isEmpty()
    }
}
