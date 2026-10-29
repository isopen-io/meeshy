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

    private val posts: PostRepository = mockk(relaxed = true)
    private val stories: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val editor = StoryEditor(posts, stories, session)
    private val post = StoryEditFixtures.iosPost
    private val opening = StoryEditFixtures.opening()
    private val cached = post.copy(isViewedByMe = false, viewCount = 12)

    private fun privateAudience(): StoryComposerUiState {
        val opened = StoryEditFixtures.opened(opening)
        return opened.copy(draft = opened.draft.withVisibility(StoryVisibility.PRIVATE))
    }

    @Test
    fun `ouvrir une story de l'utilisateur la releve au serveur et sait qu'elle porte toutes ses references`() = runTest {
        every { session.currentUserId } returns ME
        coEvery { posts.getPost("p1") } returns NetworkResult.Success(post)

        val opened = editor.open("p1")

        assertThat(opened!!.mentionsKnown).isTrue()
        assertThat(opened.slide.text).isEqualTo("Bonjour")
    }

    @Test
    fun `hors ligne la story se rouvre depuis le cache mais ne parle plus des references silencieuses`() = runTest {
        every { session.currentUserId } returns ME
        coEvery { posts.getPost("p1") } returns NetworkResult.Failure(ApiError("offline"))
        coEvery { stories.cachedStories() } returns listOf(cached)

        val opened = editor.open("p1")

        assertThat(opened!!.mentionsKnown).isFalse()
    }

    @Test
    fun `la story d'un autre auteur ne se rouvre pas`() = runTest {
        every { session.currentUserId } returns "someone-else"
        coEvery { posts.getPost("p1") } returns NetworkResult.Success(post)

        assertThat(editor.open("p1")).isNull()
    }

    @Test
    fun `un post qui n'est pas une story ne se rouvre pas ici`() = runTest {
        every { session.currentUserId } returns ME
        coEvery { posts.getPost("p1") } returns NetworkResult.Success(post.copy(type = "POST"))

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
    fun `une composition refusee ne touche ni la barre ni le reseau`() = runTest {
        val twoSlides = StoryEditFixtures.opened(opening).let { it.copy(deck = it.deck.addSlide("x").updateSelectedText("autre")) }

        val failure = editor.save(opening, twoSlides, "fr")

        assertThat(failure).isEqualTo(StoryEditErrors.ONE_SLIDE)
        coVerify(exactly = 0) { posts.update(any<String>(), any<UpdatePostRequest>()) }
        coVerify(exactly = 0) { stories.adoptPublished(any()) }
    }
}
