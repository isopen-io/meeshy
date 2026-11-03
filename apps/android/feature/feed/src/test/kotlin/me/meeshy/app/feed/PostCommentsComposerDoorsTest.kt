package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
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
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.model.mention.MentionContext
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #14384 — les portes de la barre de message que le commentaire reprend d'iOS : la pastille DÉCLARE la langue du
 * commentaire (iOS `composerLanguage` → `originalLanguage`), et un emoji rapide part comme un commentaire.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PostCommentsComposerDoorsTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)

    private object NoMentions : MentionSearch {
        override suspend fun search(query: String): List<MentionCandidate> = emptyList()
        override suspend fun suggest(query: String, context: MentionContext?): List<MentionCandidate> = emptyList()
    }

    private fun viewModel(
        user: MeeshyUser = MeeshyUser(id = "me", username = "me", systemLanguage = "pt"),
        comments: List<ApiPostComment> = emptyList(),
    ): PostCommentsViewModel {
        every { session.currentUser } returns MutableStateFlow(user)
        every { socialSocket.commentAdded } returns MutableSharedFlow()
        every { socialSocket.commentUpdated } returns MutableSharedFlow()
        every { socialSocket.commentDeleted } returns MutableSharedFlow()
        every { socialSocket.commentReactionAdded } returns MutableSharedFlow()
        every { socialSocket.commentReactionRemoved } returns MutableSharedFlow()
        every { socialSocket.commentTranslationUpdated } returns MutableSharedFlow()
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(comments)
        coEvery { repository.getCommentReplies("p1", any(), null, any()) } returns NetworkResult.Success(emptyList())
        return PostCommentsViewModel(repository, session, socialSocket, MeeshyConfig(), NoMentions, SavedStateHandle(mapOf("postId" to "p1")))
    }

    private fun sent(content: String) = NetworkResult.Success(ApiPostComment(id = "real", content = content))

    @Test
    fun `le flou et un effet permanent partent avec le commentaire, puis le composeur repart vierge (#14385)`() = runTest {
        coEvery { repository.addComment("p1", "Secret", any(), any(), any(), any(), any()) } returns sent("Secret")
        val vm = viewModel()
        vm.toggleCommentEffect(MessageEffectFlags.BLURRED)
        vm.toggleCommentEffect(MessageEffectFlags.GLOW)
        vm.toggleCommentEffect(MessageEffectFlags.VIEW_ONCE)
        vm.onDraftChange("Secret")

        vm.submit()

        val flags = (MessageEffectFlags.BLURRED or MessageEffectFlags.GLOW).toInt()
        coVerify(exactly = 1) { repository.addComment("p1", "Secret", null, flags, any(), any(), any()) }
        assertThat(vm.state.value.effects).isEqualTo(MessageEffects())
    }

    @Test
    fun `sans effet posé, le commentaire part sans effectFlags (#14385)`() = runTest {
        coEvery { repository.addComment("p1", "Salut", any(), any(), any(), any(), any()) } returns sent("Salut")
        val vm = viewModel()
        vm.onDraftChange("Salut")

        vm.submit()

        coVerify(exactly = 1) { repository.addComment("p1", "Salut", null, null, any(), any(), any()) }
    }

    @Test
    fun `une réponse floutée porte son flou (#14385)`() = runTest {
        coEvery { repository.addComment("p1", "Chut", "c1", any(), any(), any(), any()) } returns sent("Chut")
        val vm = viewModel(comments = listOf(ApiPostComment(id = "c1", content = "hi")))
        vm.beginReply("c1")
        vm.toggleCommentEffect(MessageEffectFlags.BLURRED)
        vm.onDraftChange("Chut")

        vm.submit()

        coVerify(exactly = 1) { repository.addComment("p1", "Chut", "c1", MessageEffectFlags.BLURRED.toInt(), any(), any(), any()) }
    }

    @Test
    fun `la pastille montre d'abord la langue du lecteur`() {
        assertThat(viewModel().state.value.composerLanguageCode).isEqualTo("pt")
    }

    @Test
    fun `une langue choisie à la pastille part comme langue du commentaire`() = runTest {
        coEvery { repository.addComment("p1", "Bonjour", any(), any(), any(), any(), any()) } returns sent("Bonjour")
        val vm = viewModel()
        vm.onComposerLanguagePicked("es")
        assertThat(vm.state.value.composerLanguageCode).isEqualTo("es")
        vm.onDraftChange("Bonjour")
        vm.submit()
        coVerify(exactly = 1) { repository.addComment("p1", "Bonjour", null, null, any(), "es", any()) }
        assertThat(vm.state.value.composerLanguageCode).isEqualTo("pt")
    }

    @Test
    fun `une réponse part aussi dans la langue choisie`() = runTest {
        coEvery { repository.getComments("p1", null, any()) } returns NetworkResult.Success(listOf(ApiPostComment(id = "c1", content = "hi")))
        coEvery { repository.addComment("p1", any(), "c1", any(), any(), any(), any()) } returns sent("Hola")
        val vm = viewModel()
        vm.beginReply("c1")
        vm.onComposerLanguagePicked("es")
        vm.onDraftChange("Hola")
        vm.submit()
        coVerify(exactly = 1) { repository.addComment("p1", "Hola", "c1", null, any(), "es", any()) }
    }

    @Test
    fun `un emoji rapide part aussitôt comme commentaire`() = runTest {
        coEvery { repository.addComment("p1", "👍", any(), any(), any(), any(), any()) } returns sent("👍")
        val vm = viewModel()
        vm.sendQuickEmoji("👍")
        coVerify(exactly = 1) { repository.addComment("p1", "👍", null, null, any(), any(), any()) }
        assertThat(vm.state.value.draft).isEmpty()
    }

    @Test
    fun `un emoji rapide ne remplace jamais un brouillon en cours`() = runTest {
        val vm = viewModel()
        vm.onDraftChange("en cours")
        vm.sendQuickEmoji("👍")
        coVerify(exactly = 0) { repository.addComment(any(), any(), any(), any(), any(), any(), any()) }
        assertThat(vm.state.value.draft).isEqualTo("en cours")
    }

    private val cafe = SharedPlace(latitude = 48.85, longitude = 2.35, name = "Café de Flore")

    @Test
    fun `le lieu choisi part avec le commentaire, puis le composeur repart sans lieu (#14387)`() = runTest {
        coEvery { repository.addComment("p1", "On s'y retrouve", any(), any(), any(), any(), any(), any()) } returns sent("On s'y retrouve")
        val vm = viewModel()
        vm.attachPlace(cafe)
        assertThat(vm.state.value.place).isEqualTo(cafe)
        vm.onDraftChange("On s'y retrouve")

        vm.submit()

        coVerify(exactly = 1) { repository.addComment("p1", "On s'y retrouve", null, null, any(), any(), any(), cafe) }
        assertThat(vm.state.value.place).isNull()
    }

    @Test
    fun `une réponse porte aussi son lieu (#14387)`() = runTest {
        coEvery { repository.addComment("p1", "Ici", "c1", any(), any(), any(), any(), any()) } returns sent("Ici")
        val vm = viewModel(comments = listOf(ApiPostComment(id = "c1", content = "hi")))
        vm.beginReply("c1")
        vm.attachPlace(cafe)
        vm.onDraftChange("Ici")

        vm.submit()

        coVerify(exactly = 1) { repository.addComment("p1", "Ici", "c1", null, any(), any(), any(), cafe) }
    }

    @Test
    fun `un lieu retiré ne part pas, et un envoi refusé rend le lieu au composeur (#14387)`() = runTest {
        coEvery { repository.addComment("p1", any(), any(), any(), any(), any(), any(), any()) } returns NetworkResult.Failure(ApiError(message = "nope"))
        val vm = viewModel()
        vm.attachPlace(cafe)
        vm.removePlace()
        vm.onDraftChange("Sans lieu")
        vm.submit()
        coVerify(exactly = 1) { repository.addComment("p1", "Sans lieu", null, null, any(), any(), any(), null) }

        vm.attachPlace(cafe)
        vm.onDraftChange("Avec lieu")
        vm.submit()

        assertThat(vm.state.value.place).isEqualTo(cafe)
        assertThat(vm.state.value.draft).isEqualTo("Avec lieu")
    }

    @Test
    fun `un lieu seul ne suffit pas à envoyer, la passerelle le refuserait (#14503)`() {
        val vm = viewModel()
        vm.attachPlace(cafe)
        assertThat(vm.state.value.canSubmit).isFalse()
    }
}
