package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
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
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerHostState
import me.meeshy.sdk.model.composer.ComposerIntent
import me.meeshy.sdk.model.composer.ComposerMosaicChoice
import me.meeshy.sdk.model.composer.ComposerOrigin
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.post.InMemoryPostComposerDraftStore
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.sceneItems
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #13921 — un post de plusieurs images propose de choisir leur disposition, comme iOS (`ComposerMosaicChoice`,
 * `ComposerPublishMenu`) : les images choisies ensemble fondent chacune leur scène, l'hôte offre alors les cinq dispositions
 * dans l'ordre d'iOS, celle que l'auteur arme voyage dans `CanvasV3.layout`, et le fil la relit. Derrière une story cochée
 * avec lui, le post garde son choix ; la story n'en porte aucun.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerPostLayoutPublishTest {
    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val media: StoryMediaUploader = mockk<StoryMediaUploader>(relaxed = true).also { it.answersEachFromWhole() }
    private val publications: PublicationOutbox = mockk(relaxed = true)

    private fun viewModel(): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            repo, session, media, mockk<MediaUploadQueue>(relaxed = true), mockk<WorkManager>(relaxed = true),
            InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true), mockk<StoryDraftConfirmation>(relaxed = true),
            BlockCache(), publications = publications, postDrafts = InMemoryPostComposerDraftStore(),
        )
    }

    private fun uploaded(id: String) = UploadedMedia(id, "https://cdn/$id.jpg", "image/jpeg", 1, 1, 1, null, null)

    private fun picked(vm: StoryComposerViewModel, vararg ids: String) {
        coEvery { media.upload(any(), any()) } returns NetworkResult.Success(ids.map(::uploaded))
        vm.onMediaPicked(ids.map { MediaUploadItem(byteArrayOf(1), "$it.jpg", "image/jpeg") })
    }

    private fun posted(): MutableList<CreatePostRequest> {
        val requests = mutableListOf<CreatePostRequest>()
        coEvery { publications.enqueuePost(any(), any()) } answers { requests += firstArg<CreatePostRequest>(); "cmid_post" }
        return requests
    }

    /** Ce que l'hôte voit de la scène, puis la disposition que l'auteur y arme. */
    private fun host(origin: ComposerOrigin, vm: StoryComposerViewModel) =
        ComposerHostState.open(ComposerIntent(origin)).withSceneCount(vm.state.value.postSceneSlides.size)

    @Test
    fun `two images picked together make two scenes, and the post offers the five layouts in the order of iOS`() = runTest {
        val vm = viewModel()
        vm.onFormats(listOf(ComposerFormat.POST), layout = null)

        picked(vm, "a", "b")

        val offer = host(ComposerOrigin.FeedComposer, vm)
        assertThat(vm.state.value.postSceneSlides).hasSize(2)
        assertThat(offer.layoutChoices).containsExactly(
            MosaicLayoutMode.CAROUSEL, MosaicLayoutMode.REEL, MosaicLayoutMode.HERO, MosaicLayoutMode.WAVE, MosaicLayoutMode.SINE,
        ).inOrder()
        assertThat(ComposerMosaicChoice.checked(offer.layout)).isEqualTo(MosaicLayoutMode.CAROUSEL)
    }

    @Test
    fun `the layout the author arms travels in the canvas and the feed reads it back`() = runTest {
        val requests = posted()
        val vm = viewModel()
        vm.onFormats(listOf(ComposerFormat.POST), layout = null)
        picked(vm, "a", "b")
        val armed = host(ComposerOrigin.FeedComposer, vm).chooseLayout(MosaicLayoutMode.HERO)
        vm.onFormats(armed.publishedFormats, armed.layout)

        vm.publish()

        val request = requests.single()
        assertThat(request.storyEffects?.canvas?.layout).isEqualTo(MosaicLayoutMode.HERO)
        val read = requireNotNull(servedBack(request).sceneItems())
        assertThat(read.layout).isEqualTo(MosaicLayoutMode.HERO)
        assertThat(read.items.map { item -> item.media.map { it.id } }).containsExactly(listOf("a"), listOf("b")).inOrder()
    }

    /** Le post tel que le fil le relit : la charge envoyée, rendue par le serveur avec ses médias. */
    private fun servedBack(request: CreatePostRequest): ApiPost {
        val sent = MeeshyApi.json.encodeToJsonElement(CreatePostRequest.serializer(), request).jsonObject
        val media = request.mediaIds.orEmpty().joinToString(",") { """{ "id": "$it", "fileUrl": "https://cdn/$it.jpg", "mimeType": "image/jpeg" }""" }
        return MeeshyApi.json.decodeFromString(
            ApiPost.serializer(),
            """{ "id": "p1", "type": "POST", "media": [$media], "storyEffects": ${sent.getValue("storyEffects")} }""",
        )
    }

    @Test
    fun `a post of one image offers no layout and publishes none`() = runTest {
        val requests = posted()
        val vm = viewModel()
        vm.onFormats(listOf(ComposerFormat.POST), layout = MosaicLayoutMode.HERO)
        picked(vm, "a")

        assertThat(host(ComposerOrigin.FeedComposer, vm).layoutChoices).isEmpty()
        vm.publish()

        assertThat(requests.single().storyEffects?.canvas?.layout).isNull()
    }

    @Test
    fun `a post checked behind a story keeps its layout, the stories carry none`() = runTest {
        val requests = posted()
        val stories = mutableListOf<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(any(), any()) } answers { stories += firstArg<CreateStoryRequest>(); "cmid_story_${stories.size}" }
        val vm = viewModel()
        vm.onFormats(listOf(ComposerFormat.STORY), layout = null)
        picked(vm, "a", "b")
        val armed = host(ComposerOrigin.StoryTray, vm).toggle(ComposerFormat.POST).chooseLayout(MosaicLayoutMode.WAVE)
        vm.onFormats(armed.publishedFormats, armed.layout)

        vm.publish()

        assertThat(requests.single().storyEffects?.canvas?.layout).isEqualTo(MosaicLayoutMode.WAVE)
        assertThat(stories).hasSize(2)
        assertThat(stories.map { it.storyEffects?.canvas?.layout }).containsExactly(null, null)
    }
}
