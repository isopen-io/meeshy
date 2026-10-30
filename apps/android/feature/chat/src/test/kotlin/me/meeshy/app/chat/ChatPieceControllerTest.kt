package me.meeshy.app.chat

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
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

    private fun carrier(
        vararg pieces: ApiMessageAttachment,
        text: String = "",
        sender: String = "me",
        conversation: String = "c1",
    ) = LocalMessage(
        ApiMessage(id = "64b7f0a1c2d3e4f5a6b7c8d9", conversationId = conversation, senderId = sender, content = text, attachments = pieces.toList()),
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

    /** Le verdict arrive APRÈS le budget : sans la borne de 5 s, la réaction et la suppression partiraient à 10 s. */
    @Test
    fun `a mode read that does not answer in time sends nothing`() = runTest {
        val r = rig(
            listOf(carrier(photo("a"), photo("b"))),
            state = servedServer,
            verdict = { delay(10_000); OutboxAdmissionVerdict.ADMIT },
        )
        coEvery { r.remover.remove(any(), any()) } returns PieceRemoval.REMOVED
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
    fun `removing one piece of several in an end-to-end or unknown conversation calls no gateway and says so`() = runTest {
        listOf(OutboxAdmissionVerdict.WITHHOLD, OutboxAdmissionVerdict.WAIT, OutboxAdmissionVerdict.UNREACHABLE).forEach { refused ->
            val several = rig(listOf(carrier(photo("a"), photo("b"))), state = servedServer, verdict = { refused })
            val toldSeveral = told(several, this)

            several.controller.delete(messageId, "b")
            runCurrent()

            coVerify(exactly = 0) { several.remover.remove(any(), any()) }
            assertThat(toldSeveral).containsExactly(PieceFailure.REMOVE)
        }
    }

    @Test
    fun `deleting the last piece of an end-to-end or unreachable conversation deletes nothing and says so`() = runTest {
        listOf(OutboxAdmissionVerdict.WITHHOLD, OutboxAdmissionVerdict.UNREACHABLE).forEach { refused ->
            val last = rig(listOf(carrier(photo("a"))), state = servedServer, verdict = { refused })
            val toldLast = told(last, this)

            last.controller.delete(messageId, "a")
            runCurrent()

            coVerify(exactly = 0) { last.repo.deleteOptimistic(any()) }
            verify(exactly = 0) { last.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
            assertThat(toldLast).containsExactly(PieceFailure.REMOVE)
        }
    }

    /** Supprimer le message entier passe par l'outbox, qui juge elle-même un mode inconnu : la ligne attend sans risque. */
    @Test
    fun `deleting the last piece while the mode is unknown or unread in time is queued for the outbox to judge`() = runTest {
        listOf<ConversationPlaintextVerdict>(
            ConversationPlaintextVerdict { OutboxAdmissionVerdict.WAIT },
            ConversationPlaintextVerdict { awaitCancellation() },
            ConversationPlaintextVerdict { error("relecture en panne") },
        ).forEach { unknown ->
            val last = rig(listOf(carrier(photo("a"))), state = servedServer, verdict = unknown)
            coEvery { last.repo.deleteOptimistic(messageId) } returns true
            val toldLast = told(last, this)

            last.controller.delete(messageId, "a")
            advanceTimeBy(60_000)
            runCurrent()

            coVerify(exactly = 1) { last.repo.deleteOptimistic(messageId) }
            verify(exactly = 1) { last.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
            assertThat(toldLast).isEmpty()
        }
    }

    // ── #13803 bis — un geste qui EFFACE se juge sur la ligne (passerelle `removeAttachmentReaction`) ──

    @Test
    fun `withdrawing a piece reaction leaves at once, even in an end-to-end or unknown conversation`() = runTest {
        val e2ee = ChatUiState(conversationId = "c1", encryptionMode = "e2ee")
        listOf<ConversationPlaintextVerdict>(
            ConversationPlaintextVerdict { OutboxAdmissionVerdict.WITHHOLD },
            ConversationPlaintextVerdict { OutboxAdmissionVerdict.WAIT },
            ConversationPlaintextVerdict { OutboxAdmissionVerdict.UNREACHABLE },
            ConversationPlaintextVerdict { awaitCancellation() },
        ).forEach { notAdmitted ->
            listOf(servedServer, e2ee).forEach { state ->
                val r = rig(listOf(carrier(photo("a", mine = listOf("👍")))), state = state, verdict = notAdmitted)

                r.controller.react(messageId, "a", "👍")
                runCurrent()

                coVerify(exactly = 1) { r.realtime.toggleAttachmentReaction(messageId, "a", "👍", false) }
            }
        }
    }

    @Test
    fun `adding a piece reaction in an end-to-end conversation still sends nothing`() = runTest {
        val r = rig(
            listOf(carrier(photo("a", mine = listOf("👍")))),
            state = ChatUiState(conversationId = "c1", encryptionMode = "e2ee"),
            verdict = { OutboxAdmissionVerdict.WITHHOLD },
        )

        r.controller.react(messageId, "a", "🔥")
        runCurrent()

        coVerify(exactly = 0) { r.realtime.toggleAttachmentReaction(any(), any(), any(), any()) }
    }

    // ── la conversation du message ET celle de l'écran sont jugées ──

    @Test
    fun `a message carrying another conversation than the screen is judged on both`() = runTest {
        val asked = mutableListOf<String>()
        val judge = ConversationPlaintextVerdict { id ->
            asked += id
            if (id == "c1") OutboxAdmissionVerdict.ADMIT else OutboxAdmissionVerdict.WITHHOLD
        }
        val r = rig(listOf(carrier(photo("a"), photo("b"), conversation = "c2")), state = servedServer, verdict = judge)
        val told = told(r, this)

        r.controller.react(messageId, "a", "👍")
        runCurrent()
        assertThat(asked).containsExactly("c1", "c2").inOrder()
        asked.clear()

        r.controller.delete(messageId, "b")
        runCurrent()

        assertThat(asked).containsExactly("c1", "c2").inOrder()
        coVerify(exactly = 0) { r.realtime.toggleAttachmentReaction(any(), any(), any(), any()) }
        coVerify(exactly = 0) { r.remover.remove(any(), any()) }
        assertThat(told).containsExactly(PieceFailure.REMOVE)
    }

    // ── un second toucher pendant le vol est inerte ──

    @Test
    fun `a second tap on the same piece and emoji while the first is in flight is ignored`() = runTest {
        val reading = CompletableDeferred<OutboxAdmissionVerdict>()
        val r = rig(listOf(carrier(photo("a"))), state = servedServer, verdict = { reading.await() })

        r.controller.react(messageId, "a", "👍")
        r.controller.react(messageId, "a", "👍")
        r.controller.react(messageId, "a", "🔥")
        runCurrent()
        reading.complete(OutboxAdmissionVerdict.ADMIT)
        runCurrent()

        coVerify(exactly = 1) { r.realtime.toggleAttachmentReaction(messageId, "a", "👍", true) }
        coVerify(exactly = 1) { r.realtime.toggleAttachmentReaction(messageId, "a", "🔥", true) }

        r.controller.react(messageId, "a", "👍")
        runCurrent()

        coVerify(exactly = 2) { r.realtime.toggleAttachmentReaction(messageId, "a", "👍", true) }
    }

    @Test
    fun `a second tap on a withdrawal still in flight is ignored`() = runTest {
        val sending = CompletableDeferred<Boolean>()
        val r = rig(listOf(carrier(photo("a", mine = listOf("👍")))))
        coEvery { r.realtime.toggleAttachmentReaction(any(), any(), any(), any()) } coAnswers { sending.await() }

        r.controller.react(messageId, "a", "👍")
        r.controller.react(messageId, "a", "👍")
        runCurrent()
        sending.complete(true)
        runCurrent()

        coVerify(exactly = 1) { r.realtime.toggleAttachmentReaction(messageId, "a", "👍", false) }
    }

    @Test
    fun `a second delete of the same piece while the first is in flight is ignored`() = runTest {
        val removing = CompletableDeferred<PieceRemoval>()
        val r = rig(listOf(carrier(photo("a"), photo("b"))))
        coEvery { r.remover.remove(messageId, any()) } coAnswers { removing.await() }

        r.controller.delete(messageId, "b")
        r.controller.delete(messageId, "b")
        r.controller.delete(messageId, "a")
        runCurrent()
        removing.complete(PieceRemoval.REMOVED)
        runCurrent()

        coVerify(exactly = 1) { r.remover.remove(messageId, "b") }
        coVerify(exactly = 1) { r.remover.remove(messageId, "a") }

        r.controller.delete(messageId, "b")
        runCurrent()

        coVerify(exactly = 2) { r.remover.remove(messageId, "b") }
    }
}
