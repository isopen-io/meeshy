package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import me.meeshy.app.stories.StoryEditFixtures.ME
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UpdatePostRequest
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryRepository
import org.junit.Test

class StoryEditorTest {

    private val reader: StoryServedReader = mockk()
    private val posts: PostRepository = mockk(relaxed = true)
    private val stories: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true) { every { currentUserId } returns ME }
    private val editor = StoryEditor(reader, posts, stories, session)
    private val post = StoryEditFixtures.iosPost
    private val opening = StoryEditFixtures.opening()
    private val servedStory = ServedStory(post, StoryEditFixtures.servedFor(post))
    private val cached = post.copy(isViewedByMe = false, viewCount = 12)

    private fun privateAudience(): StoryComposerUiState {
        val opened = StoryEditFixtures.opened(opening)
        return opened.copy(draft = opened.draft.withVisibility(StoryVisibility.PRIVATE))
    }

    @Test
    fun `ouvrir une story de l'utilisateur la releve au serveur et sait qu'elle porte toutes ses references`() = runTest {
        coEvery { reader.read("p1") } returns servedStory

        val opened = editor.open("p1")

        assertThat(opened!!.mentionsKnown).isTrue()
        assertThat(opened.slide.text).isEqualTo("Bonjour")
        assertThat(opened.served).isEqualTo(servedStory.effects)
    }

    @Test
    fun `hors ligne la story se rouvre depuis le cache mais ne parle plus des references silencieuses`() = runTest {
        coEvery { reader.read("p1") } returns null
        coEvery { stories.cachedStories() } returns listOf(cached)

        val opened = editor.open("p1")

        assertThat(opened!!.mentionsKnown).isFalse()
        assertThat(opened.served).isNull()
    }

    @Test
    fun `la story d'un autre auteur ne se rouvre pas`() = runTest {
        every { session.currentUserId } returns "someone-else"
        coEvery { reader.read("p1") } returns servedStory

        assertThat(editor.open("p1")).isNull()
    }

    @Test
    fun `un post qui n'est pas une story ne se rouvre pas ici`() = runTest {
        coEvery { reader.read("p1") } returns servedStory.copy(post = post.copy(type = "POST"))

        assertThat(editor.open("p1")).isNull()
    }

    @Test
    fun `enregistrer met a jour la story par la route de mise a jour, jamais par la creation`() = runTest {
        coEvery { stories.cachedStories() } returns listOf(cached)
        val sent = slot<UpdatePostRequest>()
        coEvery { posts.update("p1", capture(sent)) } returns NetworkResult.Success(post.copy(visibility = "PRIVATE"))

        val failure = editor.save(opening, privateAudience(), "fr")

        assertThat(failure).isNull()
        assertThat(sent.captured.visibility).isEqualTo("PRIVATE")
        coVerify(exactly = 0) { stories.enqueuePublish(any(), any()) }
    }

    @Test
    fun `la barre montre l'edition avant la reponse puis la reponse du serveur`() = runTest {
        coEvery { stories.cachedStories() } returns listOf(cached)
        val adopted = mutableListOf<ApiPost>()
        coEvery { stories.adoptPublished(capture(adopted)) } returns Unit
        coEvery { posts.update("p1", any<UpdatePostRequest>()) } returns NetworkResult.Success(post.copy(visibility = "PRIVATE"))

        editor.save(opening, privateAudience(), "fr")

        assertThat(adopted.map { it.visibility }).containsExactly("PRIVATE", "PRIVATE").inOrder()
        coVerifyOrder {
            stories.adoptPublished(match { it.visibility == "PRIVATE" })
            posts.update("p1", any<UpdatePostRequest>())
        }
    }

    @Test
    fun `un refus du serveur rend la ligne d'avant et dit l'echec`() = runTest {
        coEvery { stories.cachedStories() } returns listOf(cached)
        val adopted = mutableListOf<ApiPost>()
        coEvery { stories.adoptPublished(capture(adopted)) } returns Unit
        coEvery { posts.update("p1", any<UpdatePostRequest>()) } returns NetworkResult.Failure(ApiError("boom", httpStatus = 500))

        val failure = editor.save(opening, privateAudience(), "fr")

        assertThat(failure).isEqualTo(StoryEditErrors.FAILED)
        assertThat(adopted.last()).isEqualTo(cached)
        assertThat(adopted.first().visibility).isEqualTo("PRIVATE")
    }

    @Test
    fun `une story rouverte du cache relit son blob servi avant d'ecrire, et c'est sur lui qu'elle s'ecrit`() = runTest {
        coEvery { stories.cachedStories() } returns listOf(cached)
        coEvery { reader.read("p1") } returns servedStory
        val sent = slot<UpdatePostRequest>()
        coEvery { posts.update("p1", capture(sent)) } returns NetworkResult.Success(post)
        val fromCache = StoryEditFixtures.opening(served = null)
        val state = StoryEditFixtures.opened(fromCache).let { opened ->
            val slide = opened.deck.selectedSlide
            opened.copy(deck = StorySlideDeck(listOf(slide.copy(elements = slide.elements.map { if (it.id == "t2") it.copy(text = "Bonsoir") else it })), slide.id))
        }

        val failure = editor.save(fromCache, state, "fr")

        assertThat(failure).isNull()
        assertThat(sent.captured.storyEffects!!.document!!["musicTrackId"].toString()).isEqualTo("\"legacy-track-9\"")
    }

    @Test
    fun `une story rouverte du cache ne s'ecrit pas quand son blob servi reste injoignable`() = runTest {
        coEvery { stories.cachedStories() } returns listOf(cached)
        coEvery { reader.read("p1") } returns null

        val failure = editor.save(StoryEditFixtures.opening(served = null), privateAudience(), "fr")

        assertThat(failure).isEqualTo(StoryEditErrors.OFFLINE)
        coVerify(exactly = 0) { posts.update(any<String>(), any<UpdatePostRequest>()) }
        coVerify(exactly = 0) { stories.adoptPublished(any()) }
    }

    @Test
    fun `un compte change pendant l'edition n'ecrit rien, ni au serveur ni dans sa barre`() = runTest {
        every { session.currentUserId } returns "64f0a1b2c3d4e5f6a7b8c9ff"
        coEvery { stories.cachedStories() } returns listOf(cached)

        val failure = editor.save(opening, privateAudience(), "fr")

        assertThat(failure).isEqualTo(StoryEditErrors.UNAVAILABLE)
        coVerify(exactly = 0) { posts.update(any<String>(), any<UpdatePostRequest>()) }
        coVerify(exactly = 0) { stories.adoptPublished(any()) }
    }

    @Test
    fun `une composition refusee ne touche ni la barre ni le reseau`() = runTest {
        val twoSlides = StoryEditFixtures.opened(opening).let { it.copy(deck = it.deck.addSlide("x").updateSelectedText("autre")) }

        val failure = editor.save(opening, twoSlides, "fr")

        assertThat(failure).isEqualTo(StoryEditErrors.ONE_SLIDE)
        coVerify(exactly = 0) { posts.update(any<String>(), any<UpdatePostRequest>()) }
        coVerify(exactly = 0) { stories.adoptPublished(any()) }
    }

    @Test
    fun `une image reglee pendant l edition part cuite, et la mise a jour ne nomme que la copie, jamais un look`() = runTest {
        coEvery { stories.cachedStories() } returns listOf(cached)
        val copy = me.meeshy.sdk.media.MediaUploadItem(byteArrayOf(9), "story-look.jpg", "image/jpeg")
        val uploaded = me.meeshy.sdk.model.UploadedMedia("baked-1", "2026/10/baked-1/photo.jpg", "image/jpeg", 1, 600, 800, null, null)
        val uploader: StoryMediaUploader = mockk { coEvery { upload(listOf(copy), any()) } returns NetworkResult.Success(listOf(uploaded)) }
        val baking = StoryEditor(reader, posts, stories, session, StoryLookOven({ copy }, mockk(), uploader))
        val opened = StoryEditFixtures.opened(opening)
        val looked = opened.copy(deck = opened.deck.withSelectedMediaLook(StoryEditFixtures.FOREGROUND_PHOTO, me.meeshy.sdk.model.StoryMediaLook(filterPreset = "warm")))
        val sent = slot<UpdatePostRequest>()
        coEvery { posts.update("p1", capture(sent)) } returns NetworkResult.Success(post)

        assertThat(baking.save(opening, looked, "fr")).isNull()

        assertThat(sent.captured.mediaIds).containsExactly("baked-1")
        assertThat(sent.captured.removeMediaIds).contains(StoryEditFixtures.FOREGROUND_PHOTO)
        assertThat(me.meeshy.sdk.net.MeeshyApi.json.encodeToString(UpdatePostRequest.serializer(), sent.captured)).doesNotContain("filterPreset")
    }

    @Test
    fun `une copie cuite qui ne part pas laisse la story intacte`() = runTest {
        val uploader: StoryMediaUploader = mockk { coEvery { upload(any(), any()) } returns NetworkResult.Failure(ApiError("offline")) }
        val baking = StoryEditor(reader, posts, stories, session, StoryLookOven({ me.meeshy.sdk.media.MediaUploadItem(byteArrayOf(9), "c.jpg", "image/jpeg") }, mockk(), uploader))
        val opened = StoryEditFixtures.opened(opening)
        val looked = opened.copy(deck = opened.deck.withSelectedMediaLook(StoryEditFixtures.FOREGROUND_PHOTO, me.meeshy.sdk.model.StoryMediaLook(filterPreset = "warm")))

        assertThat(baking.save(opening, looked, "fr")).isEqualTo(StoryEditErrors.FAILED)
        coVerify(exactly = 0) { posts.update(any(), any<UpdatePostRequest>()) }
    }
}
