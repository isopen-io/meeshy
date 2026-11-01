package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerFormat
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
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #14302 — le média que le plateau peint en fond d'une scène part avec elle. Le premier média d'une slide sans fond la
 * fonde sans être DÉSIGNÉ : la scène le peint, la publication ne le nommait que dans `mediaIds`. Dès qu'un sticker, un texte
 * ou un son faisait partir un document, la scène publiée n'avait plus que le sol et le sticker — la vidéo manquait.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryPaintedBackdropPublishTest {
    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val media: StoryMediaUploader = mockk<StoryMediaUploader>(relaxed = true).also { it.answersEachFromWhole() }
    private val publications: PublicationOutbox = mockk(relaxed = true)
    private val video = UploadedMedia("v", "https://cdn/v.mp4", "video/mp4", 1, 1080, 1920, 6_000, null)

    private fun viewModel(stored: StoryComposerDraftSnapshot? = null): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            repo, session, media, mockk<MediaUploadQueue>(relaxed = true), mockk<WorkManager>(relaxed = true),
            InMemoryStoryComposerDraftStore(stored), mockk<MediaBlobStore>(relaxed = true), mockk<StoryDraftConfirmation>(relaxed = true),
            BlockCache(), publications = publications, postDrafts = InMemoryPostComposerDraftStore(),
        )
    }

    private fun pickedVideo(vm: StoryComposerViewModel) {
        coEvery { media.upload(any(), any()) } returns NetworkResult.Success(listOf(video))
        vm.onMediaPicked(listOf(MediaUploadItem(byteArrayOf(1), "v.mp4", "video/mp4")))
    }

    private fun posted(): MutableList<CreatePostRequest> {
        val requests = mutableListOf<CreatePostRequest>()
        coEvery { publications.enqueuePost(any(), any()) } answers { requests += firstArg<CreatePostRequest>(); "cmid_post" }
        return requests
    }

    /** Les fichiers que les objets `media` de la scène publiée nomment, tels que la passerelle les reçoit. */
    private fun CreatePostRequest.sceneMediaIds(): List<String> {
        val sent = MeeshyApi.json.encodeToJsonElement(CreatePostRequest.serializer(), this).jsonObject
        val scenes = sent["storyEffects"]?.jsonObject?.get("scenes")?.jsonArray.orEmpty()
        return scenes.flatMap { it.jsonObject.getValue("objects").jsonArray }
            .map { it.jsonObject }
            .filter { it["kind"]?.jsonPrimitive?.content == "media" }
            .mapNotNull { it["payload"]?.jsonObject?.get("postMediaId")?.jsonPrimitive?.contentOrNull }
    }

    @Test
    fun `a post whose video founds the scene under a sticker publishes the video in the scene`() = runTest {
        val requests = posted()
        val vm = viewModel()
        vm.onFormats(listOf(ComposerFormat.POST), layout = null)
        pickedVideo(vm)
        vm.onAddSticker("😎")
        assertThat(vm.state.value.selectedSlideBackdropMediaId).isEqualTo("v")

        vm.publish()

        val request = requests.single()
        assertThat(request.mediaIds).containsExactly("v")
        assertThat(request.sceneMediaIds()).containsExactly("v")
    }

    @Test
    fun `a reopened draft whose video founds the scene publishes the video it shows`() = runTest {
        val requests = posted()
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "s1", mediaIds = listOf("v"), stickers = listOf(StoryStickerElement(id = "st", emoji = "😎")))),
            selectedId = "s1",
        )
        val stored = deck.toDraftSnapshot(
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = Instant.now().toString(),
            format = StoryDraftFormat(format = ComposerFormat.POST.name, media = listOf(video)),
        )
        val vm = viewModel(stored)
        vm.onEnterComposer()
        vm.onFormats(listOf(ComposerFormat.POST), layout = null)
        assertThat(vm.state.value.selectedSlideBackdropMediaId).isEqualTo("v")

        vm.publish()

        assertThat(requests.single().sceneMediaIds()).containsExactly("v")
    }

    @Test
    fun `a story whose video founds the scene under a sticker carries the video as its background object`() = runTest {
        val stories = mutableListOf<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(any(), any()) } answers { stories += firstArg<CreateStoryRequest>(); "cmid_story" }
        val vm = viewModel()
        vm.onFormats(listOf(ComposerFormat.STORY), layout = null)
        pickedVideo(vm)
        vm.onAddSticker("😎")

        vm.publish()

        val objects = stories.single().storyEffects?.mediaObjects.orEmpty()
        assertThat(objects.map { it.postMediaId to it.isBackground }).containsExactly("v" to true)
    }

    @Test
    fun `a post of a lone video, with nothing else on its scene, stays the gallery post it was`() = runTest {
        val requests = posted()
        val vm = viewModel()
        vm.onFormats(listOf(ComposerFormat.POST), layout = null)
        pickedVideo(vm)

        vm.publish()

        val request = requests.single()
        assertThat(request.mediaIds).containsExactly("v")
        assertThat(request.storyEffects).isNull()
    }
}
