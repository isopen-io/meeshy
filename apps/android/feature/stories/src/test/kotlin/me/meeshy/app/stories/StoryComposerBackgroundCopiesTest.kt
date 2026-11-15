package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Passer un média posé en fond (#13905) : seul l'OBJET choisi devient le fond. Ses copies (#13902, même fichier, autre
 * objet) restent posées, se peignent, se rangent sur la pile, partent au fil et se relisent à l'édition — comme iOS, où
 * `isBackground` est porté par un objet, jamais par un fichier.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerBackgroundCopiesTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val photo = UploadedMedia(id = "m1", url = "https://cdn/m1", mimeType = "image/jpeg", fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)

    private fun withCopy(): StoryComposerUiState {
        val slide = StorySlide(
            id = "s",
            mediaIds = listOf("m1"),
            placedMedia = listOf(StoryPlacedMedia("m1", x = 0.4f, y = 0.4f, zIndex = 1), StoryPlacedMedia("m1", x = 0.45f, y = 0.45f, zIndex = 2, id = "c1")),
        )
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), slide.id), attachments = listOf(photo)).mirrorDraftToSelection()
    }

    private fun mediaRef(id: String) = SceneObjectRef(ComposerObjectKind.MEDIA, id)

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "en"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk<StoryMediaUploader>(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true),
        )
    }

    @Test
    fun `the copy made the background leaves the scene alone, the source stays posed`() {
        val next = StoryComposerBackgroundReducer.backgroundMediaToggled(withCopy(), "m1", objectId = "c1")

        val slide = next.deck.selectedSlide
        assertThat(slide.backgroundMediaId).isEqualTo("m1")
        val source = slide.placedMedia.single()
        assertThat(source.mediaId to source.x).isEqualTo("m1" to 0.4f)
        assertThat(source.id).isNotEqualTo(slide.backgroundMediaId)
        assertThat(next.copy(selectedMediaId = source.id).selectionBar?.actions).contains(ComposerSelectionAction.TIME)
    }

    @Test
    fun `Set as background from the selection keeps every other copy on the scene`() {
        val vm = viewModel()
        vm.onSceneReduce { StoryComposerSelectionReducer.mediaSelected(withCopy(), "m1") }

        vm.onObjectController(mediaRef("m1"), Action.SET_AS_BACKGROUND)

        val slide = vm.state.value.deck.selectedSlide
        assertThat(slide.backgroundMediaId).isEqualTo("m1")
        assertThat(slide.placedMedia.map { it.id }).containsExactly("c1")
        assertThat(StorySceneStack.order(slide)).containsExactly(mediaRef("c1"))
    }

    @Test
    fun `a copy kept beside its own file as background is painted, tiled and published`() {
        val made = StoryComposerBackgroundReducer.backgroundMediaToggled(withCopy(), "m1", objectId = "m1")
        val slide = made.deck.selectedSlide

        assertThat(made.placedMediaFrames(null).map { it.placed.id }).containsExactly("c1")
        assertThat(made.thumbnailPlacedOf(slide, null)).hasSize(1)
        val published = StoryPublishPlacedMedia.resolve(slide, made)
        assertThat(published.map { it.id }).containsExactly("c1")
        assertThat(published.single().postMediaId).isEqualTo("m1")
    }

    @Test
    fun `a published background and its copy reopen as the background and one posed object`() {
        val photoId = StoryEditFixtures.FOREGROUND_PHOTO
        val post = StoryEditFixtures.canvasPost(
            """{ "mediaObjects": [
                { "id": "bg", "postMediaId": "$photoId", "isBackground": true },
                { "id": "c1", "postMediaId": "$photoId", "x": 0.45, "y": 0.45 } ] }""",
        )

        val slide = StoryEditFixtures.opened(StoryEditFixtures.opening(post, served = null)).deck.selectedSlide

        assertThat(slide.backgroundMediaId).isEqualTo(photoId)
        assertThat(slide.placedMedia.map { it.id to it.mediaId }).containsExactly("c1" to photoId)
    }
}
