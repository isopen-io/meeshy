package me.meeshy.app.chat

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageAttachmentRemover
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.PieceRemoval
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.outbox.ConversationPlaintextVerdict
import me.meeshy.sdk.outbox.OutboxAdmissionVerdict
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatPieceControllerTest {

    private val me = MeeshyUser(id = "me", username = "atabeth")

    private fun photo(id: String, mine: List<String>? = null, blurred: Boolean? = null) =
        ApiMessageAttachment(id = id, mimeType = "image/jpeg", currentUserReactions = mine, isBlurred = blurred)

    private fun carrier(vararg pieces: ApiMessageAttachment, text: String = "", sender: String = "me") = LocalMessage(
        ApiMessage(id = "64b7f0a1c2d3e4f5a6b7c8d9", conversationId = "c1", senderId = sender, content = text, attachments = pieces.toList()),
        sendState = LocalSendState.SYNCED,
    )

    private val messageId = "64b7f0a1c2d3e4f5a6b7c8d9"

    private class FakeHost(
        override val scope: CoroutineScope,
        override val messages: StateFlow<List<LocalMessage>>,
        state: ChatUiState,
    ) : ChatControllerHost {
        override val conversationId = "c1"
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(state)
        override fun reportError(message: String?) = Unit
    }

    private class Rig(
        val controller: ChatPieceController,
        val remover: MessageAttachmentRemover,
        val realtime: ChatRealtimeController,
        val repo: MessageRepository,
        val workManager: WorkManager,
    )

    private fun TestScope.rig(
        loaded: List<LocalMessage>,
        state: ChatUiState = ChatUiState(conversationId = "c1"),
        verdict: ConversationPlaintextVerdict = ConversationPlaintextVerdict { OutboxAdmissionVerdict.ADMIT },
    ): Rig {
        val remover = mockk<MessageAttachmentRemover>()
        val realtime = mockk<ChatRealtimeController>()
        coEvery { realtime.toggleAttachmentReaction(any(), any(), any(), any()) } returns true
        val repo = mockk<MessageRepository>(relaxed = true)
        val workManager = mockk<WorkManager>(relaxed = true)
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(me)
        val controller = ChatPieceController(remover, realtime, repo, workManager, session, verdict)
        controller.attach(FakeHost(backgroundScope, MutableStateFlow(loaded), state))
        return Rig(controller, remover, realtime, repo, workManager)
    }

    @Test
    fun `reacting adds an emoji the reader has not posted and removes one they have`() = runTest {
        val r = rig(listOf(carrier(photo("a"), photo("b", mine = listOf("👍")))))

        r.controller.react(messageId, "a", "👍")
        r.controller.react(messageId, "b", "👍")
        runCurrent()

        coVerify(exactly = 1) { r.realtime.toggleAttachmentReaction(messageId, "a", "👍", true) }
        coVerify(exactly = 1) { r.realtime.toggleAttachmentReaction(messageId, "b", "👍", false) }
    }

    @Test
    fun `a protected piece, a reader who cannot write or an unknown piece is never reacted to`() = runTest {
        val blurred = rig(listOf(carrier(photo("a", blurred = true))))
        blurred.controller.react(messageId, "a", "👍")

        val readOnly = rig(
            listOf(carrier(photo("a"))),
            state = ChatUiState(conversationId = "c1", composerPermissions = null, encryptionMode = "e2ee"),
        )
        readOnly.controller.react(messageId, "a", "👍")

        val unknown = rig(listOf(carrier(photo("a"))))
        unknown.controller.react(messageId, "ghost", "👍")
        unknown.controller.react("nope", "a", "👍")
        runCurrent()

        coVerify(exactly = 0) { blurred.realtime.toggleAttachmentReaction(any(), any(), any(), any()) }
        coVerify(exactly = 0) { readOnly.realtime.toggleAttachmentReaction(any(), any(), any(), any()) }
        coVerify(exactly = 0) { unknown.realtime.toggleAttachmentReaction(any(), any(), any(), any()) }
    }

    @Test
    fun `deleting one piece of several removes only that piece through the gateway`() = runTest {
        val r = rig(listOf(carrier(photo("a"), photo("b"))))
        coEvery { r.remover.remove(messageId, "b") } returns PieceRemoval.REMOVED

        r.controller.delete(messageId, "b")
        runCurrent()

        coVerify(exactly = 1) { r.remover.remove(messageId, "b") }
        coVerify(exactly = 0) { r.repo.deleteOptimistic(any()) }
    }

    @Test
    fun `deleting the last piece of a message without text deletes the whole message`() = runTest {
        val r = rig(listOf(carrier(photo("a"))))
        coEvery { r.repo.deleteOptimistic(messageId) } returns true

        r.controller.delete(messageId, "a")
        runCurrent()

        coVerify(exactly = 1) { r.repo.deleteOptimistic(messageId) }
        verify(exactly = 1) { r.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
        coVerify(exactly = 0) { r.remover.remove(any(), any()) }
    }

    @Test
    fun `a refusal of the gateway is told to the reader, the piece came back`() = runTest {
        val r = rig(listOf(carrier(photo("a"), photo("b"))))
        coEvery { r.remover.remove(messageId, "a") } returns PieceRemoval.FAILED
        val told = mutableListOf<PieceFailure>()
        backgroundScope.launch { r.controller.failures.collect { told += it } }
        runCurrent()

        r.controller.delete(messageId, "a")
        runCurrent()

        assertThat(told).containsExactly(PieceFailure.REMOVE)
    }

    @Test
    fun `a piece of someone else's message is never deleted`() = runTest {
        val r = rig(listOf(carrier(photo("a"), photo("b"), sender = "other")))

        r.controller.delete(messageId, "a")
        runCurrent()

        coVerify(exactly = 0) { r.remover.remove(any(), any()) }
        coVerify(exactly = 0) { r.repo.deleteOptimistic(any()) }
    }

    // ── #13803 — réagir à une pièce ou la supprimer suit la garde du clair des messages ──

    /** Room garde `server` (hors ligne pendant la bascule), le registre sait la conversation chiffrée : verdict retenu. */
    private val servedServer = ChatUiState(conversationId = "c1", encryptionMode = "server")

    private fun told(r: Rig, scope: TestScope): List<PieceFailure> {
        val told = mutableListOf<PieceFailure>()
        scope.backgroundScope.launch { r.controller.failures.collect { told += it } }
        scope.runCurrent()
        return told
    }

    @Test
    fun `a conversation the ledger knows end to end never receives a piece reaction, even while Room still says server`() = runTest {
        val asked = mutableListOf<String>()
        val r = rig(
            listOf(carrier(photo("a"))),
            state = servedServer,
            verdict = { id -> asked += id; OutboxAdmissionVerdict.WITHHOLD },
        )

        r.controller.react(messageId, "a", "👍")
        runCurrent()

        assertThat(asked).containsExactly("c1")
        coVerify(exactly = 0) { r.realtime.toggleAttachmentReaction(any(), any(), any(), any()) }
    }

    @Test
    fun `a conversation whose mode is unknown never receives a piece reaction`() = runTest {
        listOf(OutboxAdmissionVerdict.WAIT, OutboxAdmissionVerdict.UNREACHABLE).forEach { unknown ->
            val r = rig(listOf(carrier(photo("a"))), state = servedServer, verdict = { unknown })

            r.controller.react(messageId, "a", "👍")
            runCurrent()

            coVerify(exactly = 0) { r.realtime.toggleAttachmentReaction(any(), any(), any(), any()) }
        }
    }

    @Test
    fun `a mode read that does not answer in time sends nothing`() = runTest {
        val r = rig(listOf(carrier(photo("a"), photo("b"))), state = servedServer, verdict = { awaitCancellation() })
        val told = told(r, this)

        r.controller.react(messageId, "a", "👍")
        r.controller.delete(messageId, "b")
        advanceTimeBy(60_000)
        runCurrent()

        coVerify(exactly = 0) { r.realtime.toggleAttachmentReaction(any(), any(), any(), any()) }
        coVerify(exactly = 0) { r.remover.remove(any(), any()) }
        assertThat(told).containsExactly(PieceFailure.REMOVE)
    }

    @Test
    fun `a conversation known clear sends the piece reaction once its verdict admits it`() = runTest {
        val asked = mutableListOf<String>()
        val r = rig(
            listOf(carrier(photo("a"))),
            state = servedServer,
            verdict = { id -> asked += id; OutboxAdmissionVerdict.ADMIT },
        )

        r.controller.react(messageId, "a", "👍")
        runCurrent()

        assertThat(asked).containsExactly("c1")
        coVerify(exactly = 1) { r.realtime.toggleAttachmentReaction(messageId, "a", "👍", true) }
    }

    @Test
    fun `deleting a piece in an end-to-end or unknown conversation calls no gateway and says so`() = runTest {
        listOf(OutboxAdmissionVerdict.WITHHOLD, OutboxAdmissionVerdict.WAIT, OutboxAdmissionVerdict.UNREACHABLE).forEach { refused ->
            val several = rig(listOf(carrier(photo("a"), photo("b"))), state = servedServer, verdict = { refused })
            val last = rig(listOf(carrier(photo("a"))), state = servedServer, verdict = { refused })
            val toldSeveral = told(several, this)
            val toldLast = told(last, this)

            several.controller.delete(messageId, "b")
            last.controller.delete(messageId, "a")
            runCurrent()

            coVerify(exactly = 0) { several.remover.remove(any(), any()) }
            coVerify(exactly = 0) { last.repo.deleteOptimistic(any()) }
            verify(exactly = 0) { last.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
            assertThat(toldSeveral).containsExactly(PieceFailure.REMOVE)
            assertThat(toldLast).containsExactly(PieceFailure.REMOVE)
        }
    }
}
