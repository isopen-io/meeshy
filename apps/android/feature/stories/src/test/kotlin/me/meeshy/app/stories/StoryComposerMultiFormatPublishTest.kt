package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.REEL
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import me.meeshy.sdk.model.composer.StoryPublishTitle
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.post.InMemoryPostComposerDraftStore
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #13919 — un seul geste publie tous les formats cochés : une story par la file des stories, un post et un réel chacun par
 * `PublicationOutbox.enqueuePost`, avec leur type. Un échec partiel dit lequel n'est pas parti et ne garde que lui à
 * republier ; le brouillon garde la sélection.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerMultiFormatPublishTest {
    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val publications: PublicationOutbox = mockk(relaxed = true)

    private fun viewModel(draftStore: InMemoryStoryComposerDraftStore = InMemoryStoryComposerDraftStore()): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            repo, session, mockk<StoryMediaUploader>(relaxed = true), mockk<MediaUploadQueue>(relaxed = true), mockk<WorkManager>(relaxed = true),
            draftStore, mockk<MediaBlobStore>(relaxed = true), mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
            publications = publications, postDrafts = InMemoryPostComposerDraftStore(),
        )
    }

    private fun postedTypes(): MutableList<String> {
        val types = mutableListOf<String>()
        coEvery { publications.enqueuePost(any(), any()) } answers {
            types += firstArg<CreatePostRequest>().type
            "cmid_${types.size}"
        }
        return types
    }

    @Test
    fun `a story and a post checked together leave in one gesture, the story by its queue and the post by the outbox`() = runTest {
        val types = postedTypes()
        coEvery { repo.enqueuePublish(any(), any()) } returns "cmid_story"
        val vm = viewModel()
        vm.onFormats(listOf(STORY, POST), layout = null)
        vm.onAddSticker("🔥")

        vm.publish()

        coVerify(exactly = 1) { repo.enqueuePublish(any(), any()) }
        assertThat(types).containsExactly("POST")
        assertThat(vm.state.value.deck.hasStickers).isFalse()
    }

    @Test
    fun `a repost checked as a story and a post carries its source on the post too, never an empty post`() = runTest {
        val posted = mutableListOf<CreatePostRequest>()
        coEvery { publications.enqueuePost(any(), any()) } answers { posted += firstArg<CreatePostRequest>(); "cmid_post" }
        coEvery { repo.enqueuePublish(any(), any()) } returns "cmid_story"
        val vm = viewModel()
        vm.onRepostSource("story_source")
        vm.onFormats(listOf(STORY, POST), layout = null)
        vm.onAddSticker("🔁")

        vm.publish()

        assertThat(posted.map { it.repostOfId }).containsExactly("story_source")
    }

    @Test
    fun `a post and a reel checked together leave as two publications of their own type`() = runTest {
        val types = postedTypes()
        val vm = viewModel()
        vm.onFormats(listOf(POST, REEL), layout = null)
        vm.onAddSticker("🎬")

        vm.publish()

        assertThat(types).containsExactly("POST", "REEL").inOrder()
        coVerify(exactly = 0) { repo.enqueuePublish(any(), any()) }
    }

    @Test
    fun `a partial failure says which format did not leave, and keeps only it to publish again`() = runTest {
        coEvery { repo.enqueuePublish(any(), any()) } returns "cmid_story"
        coEvery { publications.enqueuePost(match { it.type == "REEL" }, any()) } throws IllegalStateException("outbox full")
        coEvery { publications.enqueuePost(match { it.type == "POST" }, any()) } returns "cmid_post"
        val vm = viewModel()
        vm.onFormats(listOf(STORY, POST, REEL), layout = null)
        vm.onAddSticker("🔥")

        vm.publish()

        val state = vm.state.value
        assertThat(state.publishFailedFormats).containsExactly(REEL)
        assertThat(state.restoredFormats).containsExactly(REEL)
        assertThat(state.isPublishing).isFalse()
        assertThat(state.deck.hasStickers).isTrue()
    }

    @Test
    fun `the capsule names the checked formats`() = runTest {
        val vm = viewModel()

        vm.onFormats(listOf(STORY, POST), layout = null)
        assertThat(vm.state.value.publishTitle).isEqualTo(StoryPublishTitle.StoryAndPost)

        vm.onFormats(listOf(POST, REEL), layout = null)
        assertThat(vm.state.value.publishTitle).isEqualTo(StoryPublishTitle.PostAndReel)
    }

    @Test
    fun `the post text is written as soon as a post is among the checked formats`() = runTest {
        val vm = viewModel()
        vm.onFormats(listOf(STORY, POST), layout = null)

        vm.onPostTextChange("pour le post")

        assertThat(vm.state.value.writesPostText).isTrue()
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `the draft keeps the selection, and an old draft naming one format reopens on it`() = runTest {
        val checked = StoryComposerUiState(format = POST).let { StoryComposerFormatReducer.formatted(it, listOf(POST, STORY), null) }

        val draft = checked.formatDraft()
        assertThat(draft.formats).containsExactly("POST", "STORY").inOrder()

        val snapshot = checked.deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-31T00:00:00Z", format = draft)
        assertThat(StoryComposerFormatReducer.restored(StoryComposerUiState(), snapshot).restoredFormats).containsExactly(POST, STORY).inOrder()
        val old = snapshot.copy(formats = emptyList(), format = "REEL")
        assertThat(StoryComposerFormatReducer.restored(StoryComposerUiState(), old).restoredFormats).containsExactly(REEL)
    }

    @Test
    fun `the story limits hold as soon as a story is checked, even behind a post`() {
        val long = StoryComposerUiState(format = POST).let { StoryComposerFormatReducer.formatted(it, listOf(POST), null) }
            .let { StoryComposerTextReducer.typed(it, "x".repeat(StoryComposerDraft.MAX_CHARS + 1)) }

        assertThat(StoryComposerFormatReducer.formatted(long, listOf(POST, STORY), null).publishBlock).isNotNull()
    }

}
