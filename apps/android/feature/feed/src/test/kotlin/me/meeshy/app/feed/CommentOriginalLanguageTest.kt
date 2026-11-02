package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.lang.LanguageIdentification
import me.meeshy.sdk.lang.LanguageIdentifying
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Un commentaire part toujours avec une langue (#14502) : la pastille, sinon la détection, sinon ce que la pastille
 * affiche. Historique (#12484) :
 * « Commentaire test » sans langue déclarée laissait la passerelle le deviner, et il revenait
 * traduit à son propre auteur (« Commence à tester »).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CommentOriginalLanguageTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }

    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val author = MeeshyUser(id = "me", username = "me", systemLanguage = "fr")

    private fun viewModel(identifier: LanguageIdentifying): PostCommentsViewModel {
        every { session.currentUser } returns MutableStateFlow(author)
        every { socialSocket.commentAdded } returns MutableSharedFlow()
        every { socialSocket.commentUpdated } returns MutableSharedFlow()
        every { socialSocket.commentDeleted } returns MutableSharedFlow()
        every { socialSocket.commentReactionAdded } returns MutableSharedFlow()
        every { socialSocket.commentReactionRemoved } returns MutableSharedFlow()
        every { socialSocket.commentTranslationUpdated } returns MutableSharedFlow()
        coEvery { repository.getComments("p1", null, any()) } returns
            NetworkResult.Success(listOf(ApiPostComment(id = "c1", content = "hi", author = ApiAuthor(id = "u1", username = "u1"))))
        coEvery { repository.getCommentReplies("p1", "c1", null, any()) } returns NetworkResult.Success(emptyList())
        return PostCommentsViewModel(
            repository, session, socialSocket, MeeshyConfig(), mockk<MentionSearch>(relaxed = true),
            SavedStateHandle(mapOf("postId" to "p1")), identifier,
        )
    }

    private val doubtfulPortuguese = LanguageIdentifying { LanguageIdentification("pt", 0.4) }

    @Test
    fun `a comment without a clear signal leaves with the language its pill shows, never without one (#14502)`() = runTest {
        val vm = viewModel(doubtfulPortuguese)

        vm.onDraftChange("Commentaire test")
        val pill = vm.state.value.composerLanguageCode
        vm.submit()

        coVerify(exactly = 1) {
            repository.addComment("p1", "Commentaire test", null, null, null, pill)
        }
    }

    @Test
    fun `a comment the identifier cannot read leaves with the reader's language shown on the pill (#14502)`() = runTest {
        val vm = viewModel(LanguageIdentifying.Unavailable)

        vm.onDraftChange("ok")
        vm.submit()

        coVerify(exactly = 1) {
            repository.addComment("p1", "ok", null, null, null, "fr")
        }
    }

    @Test
    fun `a picked pill language always wins (#14502)`() = runTest {
        val vm = viewModel(LanguageIdentifying { LanguageIdentification("en", 0.99) })

        vm.onComposerLanguagePicked("es")
        vm.onDraftChange("Hello there my dear friend")
        vm.submit()

        coVerify(exactly = 1) {
            repository.addComment("p1", "Hello there my dear friend", null, null, null, "es")
        }
    }

    @Test
    fun `a reply without a clear signal leaves with the language its pill shows, never without one (#14502)`() = runTest {
        val vm = viewModel(doubtfulPortuguese)
        vm.beginReply("c1")

        vm.onDraftChange("Commentaire test")
        val pill = vm.state.value.composerLanguageCode
        vm.submit()

        coVerify(exactly = 1) {
            repository.addComment("p1", "Commentaire test", "c1", null, null, pill)
        }
    }

    @Test
    fun `a comment clearly in another language keeps that language`() = runTest {
        val vm = viewModel(LanguageIdentifying { LanguageIdentification("en", 0.95) })

        vm.onDraftChange("Hello there my dear friend")
        vm.submit()

        coVerify(exactly = 1) {
            repository.addComment("p1", "Hello there my dear friend", null, null, null, "en")
        }
    }
}
