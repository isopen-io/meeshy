package me.meeshy.app.stories

import androidx.work.WorkManager
import androidx.work.WorkRequest
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.MessageRepository
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.currentCoroutineContext
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.AccountTicketContext
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryReplyViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val conversations: ConversationRepository = mockk(relaxed = true)
    private val messages: MessageRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val workManager: WorkManager = mockk(relaxed = true)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(fence: AccountFence? = null, ledger: EndToEndRegimeLedger = EndToEndRegimeLedger.None) =
        StoryReplyViewModel(conversations, messages, session, workManager, fence, ledger)

    private fun encrypted(id: String) = DirectConversationResolution.Found(
        mockk(relaxed = true) { every { this@mockk.id } returns id; every { encryptionMode } returns "e2ee" },
        fromCache = false,
    )

    private fun cached(id: String, mode: String? = null) = DirectConversationResolution.Found(
        mockk(relaxed = true) { every { this@mockk.id } returns id; every { encryptionMode } returns mode },
        fromCache = true,
    )

    private fun served(id: String, mode: String?) =
        NetworkResult.Success(mockk<me.meeshy.sdk.model.ApiConversation>(relaxed = true) { every { this@mockk.id } returns id; every { encryptionMode } returns mode })

    private fun noSend() = coVerify(exactly = 0) { messages.sendOptimistic(conversationId = any(), content = any(), originalLanguage = any(), sender = any(), storyReplyToId = any()) }

    private fun direct(id: String) = DirectConversationResolution.Found(mockk(relaxed = true) { every { this@mockk.id } returns id }, fromCache = false)

    @Test
    fun `the reply leaves in the direct conversation with the author, quoting the story`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns direct("c1")
        val vm = viewModel()
        vm.onTextChange("  trop bien  ")

        vm.send(storyId = "story-1", authorId = "author")

        coVerify(exactly = 1) {
            messages.sendOptimistic(
                conversationId = "c1",
                content = "trop bien",
                originalLanguage = any(),
                sender = any(),
                storyReplyToId = "story-1",
            )
        }
        verify(exactly = 1) { workManager.enqueue(any<WorkRequest>()) }
        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.SENT)
        assertThat(vm.state.value.text).isEmpty()
    }

    @Test
    fun `a reply with no words does not leave`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.onTextChange("   ")

        vm.send("story-1", "author")

        coVerify(exactly = 0) { conversations.directConversationWith(any()) }
        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.IDLE)
    }

    @Test
    fun `when the conversation cannot be opened the words come back and the failure is told`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns DirectConversationResolution.Queued("author")
        val vm = viewModel()
        vm.onTextChange("trop bien")

        vm.send("story-1", "author")

        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.FAILED)
        assertThat(vm.state.value.text).isEqualTo("trop bien")
        coVerify(exactly = 0) { messages.sendOptimistic(conversationId = any(), content = any(), originalLanguage = any(), sender = any(), storyReplyToId = any()) }
    }

    @Test
    fun `words typed again while the failure is told are not overwritten, and the outcome is consumed once`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns DirectConversationResolution.Queued("author")
        val vm = viewModel()
        vm.onTextChange("trop bien")
        vm.send("story-1", "author")

        vm.consumeOutcome()

        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.IDLE)
        assertThat(vm.state.value.text).isEqualTo("trop bien")
    }

    @Test
    fun `a reply belongs to the account that sent it, even when the conversation opens after another account signed in (#13501)`() = runTest(dispatcher) {
        var owner: String? = "A"
        val fence = AccountFence(OutboxOwnerSource { owner })
        val opened = CompletableDeferred<DirectConversationResolution>()
        coEvery { conversations.directConversationWith("author") } coAnswers { opened.await() }
        var queuedUnder: AccountTicket? = null
        coEvery {
            messages.sendOptimistic(conversationId = any(), content = any(), originalLanguage = any(), sender = any(), storyReplyToId = any())
        } coAnswers {
            queuedUnder = currentCoroutineContext()[AccountTicketContext]?.ticket
            "cid"
        }
        val vm = viewModel(fence)
        vm.onTextChange("les mots de A")

        vm.send("story-1", "author")
        owner = "B"
        opened.complete(direct("c1"))

        assertThat(queuedUnder?.ownerId).isEqualTo("A")
    }

    @Test
    fun `a reply to a story in an end-to-end encrypted conversation is refused, said, and never queued (#13621)`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns encrypted("c1")
        val vm = viewModel()
        vm.onTextChange("trop bien")

        vm.send("story-1", "author")

        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.ENCRYPTED)
        assertThat(vm.state.value.text).isEqualTo("trop bien")
        coVerify(exactly = 0) { messages.sendOptimistic(conversationId = any(), content = any(), originalLanguage = any(), sender = any(), storyReplyToId = any()) }
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun `a conversation this account has seen encrypted stays refused even when the cached mode lags (#13621)`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns direct("c1")
        val ledger = InMemoryEndToEndRegimeLedger().also { it.learn("c1") }
        val vm = viewModel(ledger = ledger)
        vm.onTextChange("trop bien")

        vm.send("story-1", "author")

        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.ENCRYPTED)
        coVerify(exactly = 0) { messages.sendOptimistic(conversationId = any(), content = any(), originalLanguage = any(), sender = any(), storyReplyToId = any()) }
    }

    @Test
    fun `a cached conversation with no known mode is read again, and a server that says end-to-end refuses the reply (#13621)`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns cached("c1")
        coEvery { conversations.getById("c1") } returns served("c1", "e2ee")
        val vm = viewModel()
        vm.onTextChange("trop bien")

        vm.send("story-1", "author")

        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.ENCRYPTED)
        assertThat(vm.state.value.text).isEqualTo("trop bien")
        noSend()
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun `a cached conversation with no known mode that the server says is clear lets the reply leave (#13621)`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns cached("c1")
        coEvery { conversations.getById("c1") } returns served("c1", "server")
        val vm = viewModel()
        vm.onTextChange("trop bien")

        vm.send("story-1", "author")

        coVerify(exactly = 1) { conversations.getById("c1") }
        coVerify(exactly = 1) { messages.sendOptimistic(conversationId = "c1", content = "trop bien", originalLanguage = any(), sender = any(), storyReplyToId = "story-1") }
        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.SENT)
    }

    @Test
    fun `a cached conversation with no known mode while offline sends nothing and keeps the words (#13621)`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns cached("c1")
        coEvery { conversations.getById("c1") } returns NetworkResult.Failure(ApiError(message = "offline", code = "OFFLINE"))
        val vm = viewModel()
        vm.onTextChange("trop bien")

        vm.send("story-1", "author")

        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.FAILED)
        assertThat(vm.state.value.text).isEqualTo("trop bien")
        noSend()
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun `a cached conversation whose mode is known is not read again, and a known end-to-end one is refused at once (#13621)`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns cached("c1", "e2ee")
        val vm = viewModel()
        vm.onTextChange("trop bien")

        vm.send("story-1", "author")

        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.ENCRYPTED)
        coVerify(exactly = 0) { conversations.getById(any()) }
        noSend()
    }

    @Test
    fun `a conversation sealed in the ledger is refused without reading the server (#13621)`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns cached("c1")
        val vm = viewModel(ledger = InMemoryEndToEndRegimeLedger().also { it.learn("c1") })
        vm.onTextChange("trop bien")

        vm.send("story-1", "author")

        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.ENCRYPTED)
        coVerify(exactly = 0) { conversations.getById(any()) }
        noSend()
    }
}
