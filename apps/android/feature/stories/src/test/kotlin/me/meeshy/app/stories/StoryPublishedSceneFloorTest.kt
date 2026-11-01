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
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.post.InMemoryPostComposerDraftStore
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.sceneItems
import me.meeshy.sdk.theme.DynamicColorGenerator
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #14244 — le compositeur ÉCRIT dans la publication le fond qu'il montre. Une scène composée sans fond choisi se lit, au
 * compositeur, sur le dégradé de son auteur : la story ET le post publiés du même geste portent ce dégradé
 * (`gradient:RRGGBB:000000`, la forme qu'iOS et le web lisent déjà), et se relisent donc sur le même fond partout.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryPublishedSceneFloorTest {
    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val publications: PublicationOutbox = mockk(relaxed = true)
    private val stories = mutableListOf<CreateStoryRequest>()
    private val posts = mutableListOf<CreatePostRequest>()

    private val authorFloor = StoryBackgroundValue.Gradient(DynamicColorGenerator.colorForName(AUTHOR), "000000")

    private fun viewModel(): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = AUTHOR, systemLanguage = "fr"))
        coEvery { repo.enqueuePublish(any(), any()) } answers { stories += firstArg<CreateStoryRequest>(); "cmid_story" }
        coEvery { publications.enqueuePost(any(), any()) } answers { posts += firstArg<CreatePostRequest>(); "cmid_post" }
        return StoryComposerViewModel(
            repo, session, mockk<StoryMediaUploader>(relaxed = true), mockk<MediaUploadQueue>(relaxed = true), mockk<WorkManager>(relaxed = true),
            InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true), mockk<StoryDraftConfirmation>(relaxed = true), BlockCache(),
            publications = publications, postDrafts = InMemoryPostComposerDraftStore(),
        )
    }

    private fun readBack(request: CreatePostRequest): List<StoryBackgroundValue?> {
        val sent = MeeshyApi.json.parseToJsonElement(MeeshyApi.json.encodeToString(CreatePostRequest.serializer(), request))
        val wire = requireNotNull(sent.jsonObject["storyEffects"])
        val post = MeeshyApi.json.decodeFromString(ApiPost.serializer(), """{ "id": "p", "type": "POST", "storyEffects": $wire }""")
        val projector = StorySlideProjector(API)
        return requireNotNull(post.sceneItems()).items.map { projector.project(it, ACCENT, NoContentPreferences).background }
    }

    @Test
    fun `a scene published story and post without a chosen background carries the author gradient the composer showed`() = runTest {
        val vm = viewModel()
        vm.onFormats(listOf(STORY, POST), layout = null)
        vm.onAddSticker("😀")

        vm.publish()

        assertThat(stories.single().storyEffects?.background).isEqualTo(authorFloor.serialized())
        assertThat(readBack(posts.single())).containsExactly(authorFloor)
    }

    @Test
    fun `the floor the composer paints is the gradient the document carries`() {
        assertThat(StorySceneFill.resolve(null, ACCENT).brush())
            .isEqualTo(StorySceneFill.resolve(StoryBackgroundValue.authorGradient(ACCENT), ACCENT).brush())
    }

    @Test
    fun `a chosen background is published as chosen`() = runTest {
        val vm = viewModel()
        vm.onFormats(listOf(STORY, POST), layout = null)
        vm.onAddSticker("😀")
        vm.onSlideBackgroundChange(StoryBackgroundValue.Gradient("FF3B30", "007AFF"))

        vm.publish()

        assertThat(stories.single().storyEffects?.background).isEqualTo("gradient:FF3B30:007AFF")
        assertThat(readBack(posts.single())).containsExactly(StoryBackgroundValue.Gradient("FF3B30", "007AFF"))
    }

    @Test
    fun `a post that carries only its text still leaves as a text post, without a scene nor a colour`() = runTest {
        val vm = viewModel()
        vm.onFormats(listOf(POST), layout = null)
        vm.onPostTextChange("juste du texte")

        vm.publish()

        assertThat(posts.single().storyEffects).isNull()
    }

    private companion object {
        const val AUTHOR = "recmod_m"
        const val ACCENT = "34D399"
        const val API = "https://staging.meeshy.me/api/v1/"
    }
}
