package me.meeshy.app.conversations

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
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.conversationlist.ConversationPreviewPhase
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationPeekViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val messages: MessageRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val workManager: WorkManager = mockk(relaxed = true)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        coEvery { messages.recentMessages(any(), any()) } returns emptyList()
        coEvery { messages.isCacheFresh(any()) } returns false
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(ledger: EndToEndRegimeLedger = EndToEndRegimeLedger.None) =
        ConversationPeekViewModel(messages, session, workManager, ledger)

    private fun message(id: String, content: String, senderId: String = "peer", translations: List<ApiTextTranslation> = emptyList()) =
        ApiMessage(id = id, conversationId = "c1", senderId = senderId, content = content, originalLanguage = "en", translations = translations)

    @Test
    fun `les derniers messages sont servis au Prisme du lecteur`() = runTest {
        val french = ApiTextTranslation(id = "t1", messageId = "m1", targetLanguage = "fr", translatedContent = "Bonjour")
        coEvery { messages.recentMessagesFromNetwork("c1", any()) } returns
            listOf(message("m1", "Hello", translations = listOf(french)), message("m2", "Mine", senderId = "me"))

        val vm = viewModel().also { it.open("c1") }

        val state = vm.state.value
        assertThat(state.phase).isEqualTo(ConversationPreviewPhase.Loaded)
        assertThat(state.lines.map { it.text }).containsExactly("Bonjour", "Mine").inOrder()
        assertThat(state.lines.map { it.isMine }).containsExactly(false, true).inOrder()
    }

    @Test
    fun `une panne reseau sur un cache vide dit indisponible`() = runTest {
        coEvery { messages.recentMessagesFromNetwork("c1", any()) } returns null

        val vm = viewModel().also { it.open("c1") }

        assertThat(vm.state.value.phase).isEqualTo(ConversationPreviewPhase.Unavailable)
    }

    @Test
    fun `une conversation sans message se constate vide`() = runTest {
        coEvery { messages.recentMessagesFromNetwork("c1", any()) } returns emptyList()

        val vm = viewModel().also { it.open("c1") }

        assertThat(vm.state.value.phase).isEqualTo(ConversationPreviewPhase.Empty)
    }

    @Test
    fun `l'envoi passe par la file hors ligne et vide le champ`() = runTest {
        coEvery { messages.recentMessagesFromNetwork("c1", any()) } returns null
        val vm = viewModel().also { it.open("c1") }

        vm.onDraftChange("  salut  ")
        vm.send()

        coVerify(exactly = 1) { messages.sendOptimistic(conversationId = "c1", content = "salut", originalLanguage = any(), sender = any()) }
        assertThat(vm.state.value.draft).isEmpty()
    }

    @Test
    fun `un champ vide n'envoie rien`() = runTest {
        coEvery { messages.recentMessagesFromNetwork("c1", any()) } returns null
        val vm = viewModel().also { it.open("c1") }

        vm.onDraftChange("   ")
        vm.send()

        coVerify(exactly = 0) { messages.sendOptimistic(any(), any(), any(), any()) }
    }

    @Test
    fun `une conversation chiffree verrouille le composeur et n'envoie jamais en clair`() = runTest {
        coEvery { messages.recentMessagesFromNetwork("c1", any()) } returns null
        val ledger = object : EndToEndRegimeLedger {
            override fun isSealed(conversationId: String) = true
            override fun learn(conversationId: String) = Unit
        }
        val vm = viewModel(ledger).also { it.open("c1") }

        vm.onDraftChange("secret")
        vm.send()

        assertThat(vm.state.value.composerLocked).isTrue()
        coVerify(exactly = 0) { messages.sendOptimistic(any(), any(), any(), any()) }
    }

    @Test
    fun `un echec d'envoi rend le texte au champ`() = runTest {
        coEvery { messages.recentMessagesFromNetwork("c1", any()) } returns null
        coEvery { messages.sendOptimistic(any(), any(), any(), any()) } throws IllegalStateException("boom")
        val vm = viewModel().also { it.open("c1") }

        vm.onDraftChange("salut")
        vm.send()

        assertThat(vm.state.value.draft).isEqualTo("salut")
        assertThat(vm.state.value.sendFailed).isTrue()
    }
}
