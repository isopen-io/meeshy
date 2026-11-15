package me.meeshy.app.stories

import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * La scène survit à la mort du processus (#13869, iOS `ComposerAutosaveController`) : chaque modification s'écrit après une
 * accalmie, sans attendre que l'écran se ferme. Sur le S8, un arrêt forcé perdait les médias posés et le sticker — seuls
 * le fond et le texte du post, écrits par une fermeture antérieure, revenaient.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerProcessDeathTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(store: StoryComposerDraftStore): StoryComposerViewModel {
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

    private fun StoryComposerViewModel.composeTheS8Scene() {
        onSceneReduce { state ->
            val slide = state.deck.selectedSlide.copy(
                mediaIds = listOf("bg", "m1"),
                backgroundMediaId = "bg",
                placedMedia = listOf(StoryPlacedMedia("m1", x = 0.3f, y = 0.6f, zIndex = 1)),
            )
            state.copy(deck = state.deck.copy(slides = listOf(slide)), attachments = listOf(media("bg"), media("m1")))
        }
        onPostTextChange("le texte du post")
        onAddSticker("🔥")
    }

    @Test
    fun `an edit is written after a lull, without the screen closing`() = runTest {
        val store = InMemoryStoryComposerDraftStore()
        val vm = viewModel(store)
        vm.onEnterComposer()

        vm.onAddSticker("🔥")
        advanceTimeBy(StoryComposerAutosaveWatch.DEBOUNCE_MS / 2)
        assertThat(store.load()).isNull()
        advanceTimeBy(StoryComposerAutosaveWatch.DEBOUNCE_MS)

        assertThat(store.load()?.slides?.single()?.stickers?.map { it.emoji }).containsExactly("🔥")
    }

    @Test
    fun `a composer reopened after process death restores the whole scene, and its cross asks to keep or discard`() = runTest {
        val store = InMemoryStoryComposerDraftStore()
        val killed = viewModel(store)
        killed.onEnterComposer()
        killed.composeTheS8Scene()
        advanceTimeBy(StoryComposerAutosaveWatch.DEBOUNCE_MS * 2)
        killed.viewModelScope.cancel()

        val reopened = viewModel(store)
        reopened.onEnterComposer()

        val state = reopened.state.value
        val slide = state.deck.selectedSlide
        assertThat(slide.backgroundMediaId).isEqualTo("bg")
        assertThat(slide.placedMedia.map { it.mediaId to it.x }).containsExactly("m1" to 0.3f)
        assertThat(slide.stickers.map { it.emoji }).containsExactly("🔥")
        assertThat(state.postText).isEqualTo("le texte du post")
        assertThat(state.hasDraftContent).isTrue()
    }

    @Test
    fun `a composer seeded by a door never writes over the author's stored draft`() = runTest {
        val author = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "le brouillon de l'auteur")),
            selectedId = "s1",
            visibility = "PUBLIC",
        )
        val store = InMemoryStoryComposerDraftStore(author)
        val vm = viewModel(store)
        vm.onEnterComposer(seededByDoor = true)

        vm.onAddSticker("🔥")
        advanceTimeBy(StoryComposerAutosaveWatch.DEBOUNCE_MS * 2)

        assertThat(store.load()?.slides?.single()?.text).isEqualTo("le brouillon de l'auteur")
    }
}
