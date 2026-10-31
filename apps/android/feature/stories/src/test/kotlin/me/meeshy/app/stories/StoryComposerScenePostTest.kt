package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
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
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerFormat
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
 * #13863 R1-R3 : le post et le réel se composent sur la scène de la story et partent par le chemin de publication du fil
 * (`PublicationOutbox.enqueuePost`, celui du compositeur de post d'avant) — un post texte part comme avant, un post à scène
 * avec son document ; un ancien brouillon de post se rouvre sur la scène sans perte.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerScenePostTest {
    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val publications: PublicationOutbox = mockk(relaxed = true)

    private fun viewModel(
        draftStore: InMemoryStoryComposerDraftStore = InMemoryStoryComposerDraftStore(),
        postDrafts: InMemoryPostComposerDraftStore = InMemoryPostComposerDraftStore(),
    ): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            repo, session, mockk<StoryMediaUploader>(relaxed = true), mockk<MediaUploadQueue>(relaxed = true), mockk<WorkManager>(relaxed = true),
            draftStore, mockk<MediaBlobStore>(relaxed = true), mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
            publications = publications, postDrafts = postDrafts,
        )
    }

    private fun StoryComposerViewModel.postPublished(): Pair<CreatePostRequest, PostComposerDraftSnapshot?> {
        val request = slot<CreatePostRequest>()
        var parked: PostComposerDraftSnapshot? = null
        coEvery { publications.enqueuePost(capture(request), any()) } answers {
            parked = secondArg()
            "cmid_post"
        }
        publish()
        return request.captured to parked
    }

    @Test
    fun `a post that carries only its text leaves as the very text post the feed composer sent`() = runTest {
        val vm = viewModel()
        vm.onFormat(ComposerFormat.POST, layout = null)
        vm.onPostTextChange("Bonjour le monde")

        assertThat(vm.state.value.canPublish).isTrue()
        val (request, _) = vm.postPublished()

        assertThat(request).isEqualTo(CreatePostRequest(content = "Bonjour le monde", type = "POST", visibility = "PUBLIC", originalLanguage = "fr"))
        coVerify(exactly = 0) { repo.enqueuePublish(any(), any()) }
    }

    @Test
    fun `a post composed on the scene leaves as one post carrying its scene document`() = runTest {
        val vm = viewModel()
        vm.onFormat(ComposerFormat.POST, layout = MosaicLayoutMode.WAVE)
        vm.onAddSticker("🔥")
        vm.onPostTextChange("au marché")

        val (request, _) = vm.postPublished()

        assertThat(request.type).isEqualTo("POST")
        assertThat(request.content).isEqualTo("au marché")
        assertThat(request.storyEffects?.canvas?.scenes).hasSize(1)
        assertThat(request.storyEffects?.canvas?.layout).isNull()
        coVerify(exactly = 0) { repo.enqueuePublish(any(), any()) }
    }

    @Test
    fun `a reel composed on the scene leaves as a reel`() = runTest {
        val vm = viewModel()
        vm.onFormat(ComposerFormat.REEL, layout = null)
        vm.onAddSticker("🎬")

        assertThat(vm.postPublished().first.type).isEqualTo("REEL")
    }

    @Test
    fun `the post text is the post's own, a story neither shows nor publishes it`() = runTest {
        val vm = viewModel()
        vm.onFormat(ComposerFormat.POST, layout = null)
        vm.onPostTextChange("seulement le post")
        vm.onFormat(ComposerFormat.STORY, layout = null)

        assertThat(vm.state.value.canPublish).isFalse()
        assertThat(vm.state.value.postText).isEqualTo("seulement le post")
        assertThat(vm.state.value.publishTitle).isEqualTo(me.meeshy.sdk.model.composer.StoryPublishTitle.Single)
    }

    @Test
    fun `the post text stops at the server's five thousand units`() = runTest {
        val vm = viewModel()
        vm.onFormat(ComposerFormat.POST, layout = null)

        vm.onPostTextChange("a".repeat(6000))

        assertThat(vm.state.value.postText).hasLength(5000)
    }

    @Test
    fun `publishing a post parks what « Rouvrir » gives back and lets the scene draft go`() = runTest {
        val store = InMemoryStoryComposerDraftStore()
        val vm = viewModel(draftStore = store)
        vm.onFormat(ComposerFormat.POST, layout = null)
        vm.onAddSticker("🔥")
        vm.onPostTextChange("à reprendre")

        val (_, parked) = vm.postPublished()

        assertThat(parked?.text).isEqualTo("à reprendre")
        assertThat(store.load()).isNull()
    }

    @Test
    fun `an old feed composer draft reopens on the scene without loss, and leaves the post slot`() = runTest {
        val photo = UploadedMedia("p1", "https://cdn/p1", "image/jpeg", 1L, 10, 10, null, null)
        val postDrafts = InMemoryPostComposerDraftStore(editing = PostComposerDraftSnapshot(text = "ancien texte", media = listOf(photo)))
        val store = InMemoryStoryComposerDraftStore()
        val vm = viewModel(draftStore = store, postDrafts = postDrafts)

        vm.onEnterComposer()

        val state = vm.state.value
        assertThat(state.postText).isEqualTo("ancien texte")
        assertThat(state.restoredFormat).isEqualTo(ComposerFormat.POST)
        assertThat(state.deck.slides.first().backgroundMediaId).isEqualTo("p1")
        assertThat(state.attachments.map { it.id }).containsExactly("p1")
        assertThat(postDrafts.loadEditing()).isNull()
        assertThat(store.load()?.postText).isEqualTo("ancien texte")
    }
}
