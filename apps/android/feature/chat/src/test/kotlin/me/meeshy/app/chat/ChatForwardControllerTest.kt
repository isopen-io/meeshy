package me.meeshy.app.chat

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.ForwardRefusalReason
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.share.ShareDelivery
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.sdk.outbox.OutOfThreadAdmission
import me.meeshy.sdk.outbox.OutOfThreadSendGate
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatForwardControllerTest {

    private val me = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")

    private fun group(id: String, title: String) = ApiConversation(
        id = id,
        type = "group",
        title = title,
        participants = listOf(ApiParticipant(id = "$id-p1", userId = "$id-u1")),
    )

    private val conversations = listOf(group("c1", "Here"), group("c2", "Team"), group("c3", "Family"))

    private fun source(sendState: LocalSendState = LocalSendState.SYNCED) = LocalMessage(
        ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "salut", originalLanguage = "fr"),
        sendState = sendState,
    )

    private class Rig(
        val controller: ChatForwardController,
        val flow: MutableStateFlow<ChatUiState>,
        val repo: MessageRepository,
        val workManager: WorkManager,
    ) {
        val state: ChatUiState get() = flow.value
        val forward: ForwardUiState? get() = flow.value.forward
    }

    private fun TestScope.rig(
        loaded: List<LocalMessage> = listOf(source()),
        blocked: Set<String> = emptySet(),
        messages: MutableStateFlow<List<LocalMessage>> = MutableStateFlow(loaded),
        outOfThread: OutOfThreadSendGate = OutOfThreadSendGate { OutOfThreadAdmission.SEND },
    ): Rig {
        val flow = MutableStateFlow(ChatUiState(conversationId = "c1", actionMessageId = "m1"))
        val repo = mockk<MessageRepository>(relaxed = true)
        coEvery { repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) } returns "cmid_1"
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(me)
        val workManager = mockk<WorkManager>(relaxed = true)
        val controller = ChatForwardController(
            scope = screenScope(),
            state = ChatStateAccess(flow),
            conversationId = "c1",
            messages = messages,
            messageRepository = repo,
            sessionRepository = session,
            workManager = workManager,
            outOfThread = outOfThread,
            blockedUserIds = { blocked },
        )
        controller.onConversationsLoaded(conversations)
        return Rig(controller, flow, repo, workManager)
    }

    @Test
    fun `the picker opens on every other conversation and closes the action sheet`() = runTest {
        val r = rig()

        r.controller.open("m1")

        assertThat(r.state.actionMessageId).isNull()
        assertThat(r.forward?.sourceMessageId).isEqualTo("m1")
        assertThat(r.forward?.targets?.map { it.conversationId }).containsExactly("c2", "c3").inOrder()
    }

    @Test
    fun `typing in the picker narrows the targets and closing dismisses it`() = runTest {
        val r = rig()
        r.controller.open("m1")

        r.controller.onQueryChange("fam")
        assertThat(r.forward?.targets?.map { it.conversationId }).containsExactly("c3")

        r.controller.close()
        assertThat(r.forward).isNull()
    }

    @Test
    fun `a conversation list that arrives while the picker is open repaints its targets`() = runTest {
        val r = rig()
        r.controller.open("m1")

        r.controller.onConversationsLoaded(conversations + group("c4", "Late"))
        assertThat(r.forward?.targets?.map { it.conversationId }).containsExactly("c2", "c3", "c4").inOrder()

        r.controller.onConversationsLoaded(null)
        assertThat(r.forward?.targets?.map { it.conversationId }).containsExactly("c2", "c3", "c4").inOrder()
    }

    private fun Rig.shareTo(target: String) {
        controller.toggleRecipient(target)
        controller.sendSelection()
    }

    @Test
    fun `sharing re-sends the original into the recipient, queues the flush and marks the row sent`() = runTest {
        val r = rig()
        r.controller.open("m1")

        r.shareTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 1) {
            r.repo.sendOptimistic("c2", "salut", "fr", me, null, null, "m1", "c1")
        }
        verify(exactly = 1) { r.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
        assertThat(r.forward?.deliveries).containsExactly("c2", ShareDelivery.Sent)
    }

    @Test
    fun `Send while the copy is in flight or already served never sends it twice`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<String>()
        coEvery { r.repo.sendOptimistic("c2", any(), any(), any(), any(), any(), any(), any()) } coAnswers { gate.await() }
        r.controller.open("m1")

        r.shareTo("c2")
        runCurrent()
        r.controller.sendSelection()
        r.controller.toggleRecipient("c2")
        assertThat(r.forward?.deliveries?.get("c2")).isEqualTo(ShareDelivery.Sending)

        gate.complete("cmid_2")
        advanceUntilIdle()
        r.controller.sendSelection()
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `the in-flight guard survives closing and reopening the sheet`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<String>()
        coEvery { r.repo.sendOptimistic("c2", any(), any(), any(), any(), any(), any(), any()) } coAnswers { gate.await() }
        r.controller.open("m1")
        r.shareTo("c2")
        runCurrent()

        r.controller.close()
        r.controller.open("m1")
        assertThat(r.forward?.deliveries?.get("c2")).isEqualTo(ShareDelivery.Sending)
        r.shareTo("c2")
        runCurrent()

        coVerify(exactly = 1) { r.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
        gate.complete("cmid_2")
        advanceUntilIdle()
        coVerify(exactly = 1) { r.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a share completing after the sheet reopened on another message leaves that session untouched`() = runTest {
        val other = LocalMessage(
            ApiMessage(id = "m2", conversationId = "c1", senderId = "other", content = "autre", originalLanguage = "fr"),
            sendState = LocalSendState.SYNCED,
        )
        val r = rig(listOf(source(), other))
        val gate = CompletableDeferred<String>()
        coEvery { r.repo.sendOptimistic("c2", any(), any(), any(), any(), any(), any(), any()) } coAnswers { gate.await() }
        r.controller.open("m1")
        r.shareTo("c2")
        runCurrent()

        r.controller.close()
        r.controller.open("m2")
        gate.complete("cmid_2")
        advanceUntilIdle()

        assertThat(r.forward?.sourceMessageId).isEqualTo("m2")
        assertThat(r.forward?.deliveries).isEmpty()
    }

    @Test
    fun `a message the server has not acknowledged yet cannot be shared`() = runTest {
        val r = rig(loaded = listOf(source(sendState = LocalSendState.SENDING)))
        r.controller.open("m1")

        r.shareTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 0) { r.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
        assertThat(r.forward?.plan?.canSend).isFalse()
        assertThat(r.forward?.deliveries).isEmpty()
    }

    @Test
    fun `with the sheet closed Send is inert`() = runTest {
        val r = rig()

        r.controller.toggleRecipient("c2")
        r.controller.sendSelection()
        advanceUntilIdle()

        coVerify(exactly = 0) { r.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a retry after a partial failure posts only what had not left — the copy is never duplicated`() = runTest {
        val r = rig()
        coEvery { r.repo.sendOptimistic("c2", "regarde", any(), any(), any(), any(), any(), any()) } throws IllegalStateException("db")
        r.controller.open("m1")
        r.controller.onCaptionChange("regarde")
        r.shareTo("c2")
        advanceUntilIdle()
        assertThat(r.forward?.deliveries?.get("c2")).isInstanceOf(ShareDelivery.Failed::class.java)

        coEvery { r.repo.sendOptimistic("c2", "regarde", any(), any(), any(), any(), any(), any()) } returns "cmid_9"
        r.controller.sendSelection()
        advanceUntilIdle()

        assertThat(r.forward?.deliveries?.get("c2")).isEqualTo(ShareDelivery.Sent)
        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", "salut", any(), any(), any(), any(), any(), any()) }
        coVerify(exactly = 2) { r.repo.sendOptimistic("c2", "regarde", any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `in an end to end conversation the sheet shows the refusal card, even for a message served without its cipher flag`() = runTest {
        val r = rig()
        r.flow.value = r.flow.value.copy(encryptionMode = "e2ee")

        r.controller.open("m1")
        r.controller.toggleRecipient("c2")
        r.controller.sendSelection()
        advanceUntilIdle()

        assertThat(r.forward?.refusal).isEqualTo(ForwardRefusalReason.ENCRYPTED_SOURCE)
        assertThat(r.forward?.targets).isEmpty()
        coVerify(exactly = 0) { r.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a deleted source is no longer available, and one deleted after opening is refused at the tap`() = runTest {
        val deleted = LocalMessage(
            ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "", deletedAt = "2026-10-28T00:00:00Z"),
            sendState = LocalSendState.SYNCED,
        )
        val opened = rig(listOf(deleted))
        opened.controller.open("m1")
        assertThat(opened.forward?.refusal).isEqualTo(ForwardRefusalReason.SOURCE_UNAVAILABLE)

        val messages = MutableStateFlow(listOf(source()))
        val r = rig(messages = messages)
        r.controller.open("m1")
        r.controller.toggleRecipient("c2")
        messages.value = listOf(deleted)
        r.controller.sendSelection()
        advanceUntilIdle()

        assertThat(r.forward?.refusal).isEqualTo(ForwardRefusalReason.SOURCE_UNAVAILABLE)
        coVerify(exactly = 0) { r.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a multi-selection carries every message the exit law lets out, in order`() = runTest {
        val viewOnce = LocalMessage(
            ApiMessage(id = "m0", conversationId = "c1", senderId = "other", content = "secret", originalLanguage = "fr", isViewOnce = true),
            sendState = LocalSendState.SYNCED,
        )
        val second = LocalMessage(
            ApiMessage(id = "m2", conversationId = "c1", senderId = "other", content = "suite", originalLanguage = "fr"),
            sendState = LocalSendState.SYNCED,
        )
        val r = rig(listOf(viewOnce, source(), second))

        r.controller.open(listOf("m0", "m1", "m2"))

        assertThat(r.forward?.sourceMessageId).isEqualTo("m1")
        assertThat(r.forward?.refusal).isNull()
        assertThat(r.forward?.plan?.kept).containsExactly("m1", "m2").inOrder()
        assertThat(r.forward?.plan?.withdrawn?.map { it.id }).containsExactly("m0")

        r.shareTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", "salut", "fr", me, null, null, "m1", "c1") }
        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", "suite", "fr", me, null, null, "m2", "c1") }
        coVerify(exactly = 0) { r.repo.sendOptimistic(any(), "secret", any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a multi-selection of messages that all stay in Meeshy shows the refusal card`() = runTest {
        val viewOnce = LocalMessage(
            ApiMessage(id = "m0", conversationId = "c1", senderId = "other", content = "secret", originalLanguage = "fr", isViewOnce = true),
            sendState = LocalSendState.SYNCED,
        )
        val r = rig(listOf(viewOnce))

        r.controller.open(listOf("m0"))

        assertThat(r.forward?.refusal).isNotNull()
    }

    @Test
    fun `ticking recipients arms Send and one tap sends to each of them optimistically`() = runTest {
        val r = rig()
        r.controller.open("m1")
        assertThat(r.forward?.plan?.canSend).isFalse()

        r.controller.toggleRecipient("c2")
        r.controller.toggleRecipient("c3")
        assertThat(r.forward?.selectedConversationIds).containsExactly("c2", "c3").inOrder()
        assertThat(r.forward?.plan?.canSend).isTrue()

        r.controller.sendSelection()
        assertThat(r.forward?.deliveries?.values?.toSet()).containsExactly(ShareDelivery.Sending)
        advanceUntilIdle()

        assertThat(r.forward?.deliveries?.values?.toSet()).containsExactly(ShareDelivery.Sent)
        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", "salut", "fr", me, null, null, "m1", "c1") }
        coVerify(exactly = 1) { r.repo.sendOptimistic("c3", "salut", "fr", me, null, null, "m1", "c1") }
        verify(atLeast = 1) { r.workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun `a served recipient is inert, Send twice does not duplicate, and a failed row can be retried`() = runTest {
        val r = rig()
        coEvery { r.repo.sendOptimistic("c3", any(), any(), any(), any(), any(), any(), any()) } throws IllegalStateException("db")
        r.controller.open("m1")
        r.controller.toggleRecipient("c2")
        r.controller.toggleRecipient("c3")
        r.controller.sendSelection()
        r.controller.sendSelection()
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", any(), any(), any(), any(), any(), any(), any()) }
        r.controller.toggleRecipient("c2")
        assertThat(r.forward?.selectedConversationIds).containsExactly("c2", "c3")
        assertThat(r.forward?.deliveries?.get("c3")).isInstanceOf(ShareDelivery.Failed::class.java)

        coEvery { r.repo.sendOptimistic("c3", any(), any(), any(), any(), any(), any(), any()) } returns "cmid_2"
        r.controller.sendSelection()
        advanceUntilIdle()
        assertThat(r.forward?.deliveries?.get("c3")).isEqualTo(ShareDelivery.Sent)
        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a recipient the list still calls server but the server serves end to end receives nothing, the others still do`() = runTest {
        val gated = mutableListOf<String>()
        val r = rig(outOfThread = OutOfThreadSendGate { id -> gated += id; if (id == "c2") OutOfThreadAdmission.END_TO_END else OutOfThreadAdmission.SEND })
        r.controller.open("m1")
        r.controller.toggleRecipient("c2")
        r.controller.toggleRecipient("c3")

        r.controller.sendSelection()
        advanceUntilIdle()

        assertThat(gated).containsExactly("c2", "c3").inOrder()
        coVerify(exactly = 0) { r.repo.sendOptimistic("c2", any(), any(), any(), any(), any(), any(), any()) }
        coVerify(exactly = 1) { r.repo.sendOptimistic("c3", "salut", "fr", me, null, null, "m1", "c1") }
        assertThat(r.forward?.deliveries?.get("c2")).isEqualTo(ShareDelivery.Failed(ShareFailure.SEALED_DESTINATION))
        assertThat(r.forward?.deliveries?.get("c3")).isEqualTo(ShareDelivery.Sent)
    }

    @Test
    fun `the modes of every recipient are read together, within the bound of a single gesture`() = runTest {
        val r = rig(outOfThread = OutOfThreadSendGate { delay(2_000); OutOfThreadAdmission.SEND })
        r.controller.open("m1")
        r.controller.toggleRecipient("c2")
        r.controller.toggleRecipient("c3")

        r.controller.sendSelection()
        advanceUntilIdle()

        assertThat(testScheduler.currentTime).isAtMost(2_000)
        assertThat(r.forward?.deliveries?.get("c2")).isEqualTo(ShareDelivery.Sent)
        assertThat(r.forward?.deliveries?.get("c3")).isEqualTo(ShareDelivery.Sent)
    }

    @Test
    fun `a recipient whose mode cannot be read now is queued until it is known, one the gateway no longer serves gets nothing`() = runTest {
        val r = rig(outOfThread = OutOfThreadSendGate { id -> if (id == "c2") OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN else OutOfThreadAdmission.UNREACHABLE })
        r.controller.open("m1")
        r.controller.toggleRecipient("c2")
        r.controller.toggleRecipient("c3")

        r.controller.sendSelection()
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", "salut", "fr", me, null, null, "m1", "c1") }
        coVerify(exactly = 0) { r.repo.sendOptimistic("c3", any(), any(), any(), any(), any(), any(), any()) }
        assertThat(r.forward?.deliveries?.get("c2")).isEqualTo(ShareDelivery.Queued)
        assertThat(r.forward?.deliveries?.get("c3")).isEqualTo(ShareDelivery.Failed(ShareFailure.UNREACHABLE))
    }

    @Test
    fun `a caption leaves as a separate message after the copy`() = runTest {
        val r = rig()
        r.controller.open("m1")
        r.controller.toggleRecipient("c2")
        r.controller.onCaptionChange("regarde ça")
        r.controller.sendSelection()
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", "salut", "fr", me, null, null, "m1", "c1") }
        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", "regarde ça", any(), me, null, null, null, null) }
    }

    @Test
    fun `a direct conversation with a blocked person is not a recipient`() = runTest {
        val direct = ApiConversation(
            id = "d1", type = "direct", title = "Bloqué",
            participants = listOf(ApiParticipant(id = "pm", userId = "me"), ApiParticipant(id = "pb", userId = "bad")),
        )
        val r = rig(blocked = setOf("bad"))
        r.controller.onConversationsLoaded(conversations + direct)
        r.controller.open("m1")
        assertThat(r.forward?.targets?.map { it.conversationId }).containsExactly("c2", "c3")
    }

    @Test
    fun `a flame source plans its bound and the chosen duration never exceeds it`() = runTest {
        val flame = LocalMessage(
            ApiMessage(
                id = "m1", conversationId = "c1", senderId = "other", content = "chut", originalLanguage = "fr",
                effectFlags = MessageEffectFlags.EPHEMERAL.toInt(), ephemeralDuration = 60,
            ),
            sendState = LocalSendState.SYNCED,
        )
        val r = rig(listOf(flame))
        r.controller.open("m1")
        assertThat(r.forward?.plan?.flameMaxDurationSeconds).isEqualTo(60)
        assertThat(r.forward?.chosenDurationSeconds).isEqualTo(60)

        r.controller.onDurationChange(3600)
        assertThat(r.forward?.chosenDurationSeconds).isEqualTo(60)
        r.controller.onDurationChange(30)
        r.controller.toggleRecipient("c2")
        r.controller.sendSelection()
        advanceUntilIdle()
        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", "chut", "fr", me, null, null, "m1", "c1", match { it.ephemeralDuration == 30 }) }
    }

    @Test
    fun `an end to end source is refused at the door and never reaches a recipient as text`() = runTest {
        val sealed = LocalMessage(
            ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "cipher", originalLanguage = "fr", isEncrypted = true),
            sendState = LocalSendState.SYNCED,
        )
        val r = rig(listOf(sealed))
        r.controller.open("m1")
        r.controller.toggleRecipient("c2")
        r.controller.sendSelection()
        advanceUntilIdle()
        coVerify(exactly = 0) { r.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
    }
    private fun photo(id: String, encrypted: Boolean? = null) = ApiMessageAttachment(id = id, mimeType = "image/jpeg", isEncrypted = encrypted)

    private fun carrier(vararg pieces: ApiMessageAttachment, text: String = "le texte") = LocalMessage(
        ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = text, originalLanguage = "fr", attachments = pieces.toList()),
        sendState = LocalSendState.SYNCED,
    )

    @Test
    fun `one piece leaves alone, without the text of its message, naming only that piece`() = runTest {
        val r = rig(listOf(carrier(photo("a"), photo("b"))))
        r.controller.openPiece("m1", "b")

        assertThat(r.forward?.pieceAttachmentId).isEqualTo("b")
        assertThat(r.forward?.refusal).isNull()
        r.shareTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 1) {
            r.repo.sendOptimistic("c2", "", "fr", me, null, null, "m1", "c1", forwardedAttachmentIds = listOf("b"))
        }
        assertThat(r.forward?.deliveries).containsExactly("c2", ShareDelivery.Sent)
    }

    @Test
    fun `two pieces of the same message are two shares, one can be in flight while the other leaves`() = runTest {
        val r = rig(listOf(carrier(photo("a"), photo("b"))))
        val gate = CompletableDeferred<String>()
        coEvery { r.repo.sendOptimistic("c2", any(), any(), any(), any(), any(), any(), any(), forwardedAttachmentIds = listOf("a")) } coAnswers { gate.await() }
        r.controller.openPiece("m1", "a")
        r.shareTo("c2")
        runCurrent()

        r.controller.close()
        r.controller.openPiece("m1", "b")
        assertThat(r.forward?.deliveries).isEmpty()
        r.shareTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", "", "fr", me, null, null, "m1", "c1", forwardedAttachmentIds = listOf("b")) }
        gate.complete("cmid_a")
    }

    @Test
    fun `a sealed piece, a piece the message does not carry, or an end to end conversation shows the refusal card`() = runTest {
        val sealed = rig(listOf(carrier(photo("a", encrypted = true))))
        sealed.controller.openPiece("m1", "a")
        assertThat(sealed.forward?.refusal).isEqualTo(ForwardRefusalReason.ENCRYPTED_SOURCE)

        val foreign = rig(listOf(carrier(photo("a"))))
        foreign.controller.openPiece("m1", "ghost")
        assertThat(foreign.forward?.refusal).isEqualTo(ForwardRefusalReason.ATTACHMENT_NOT_IN_SOURCE)

        val e2ee = rig(listOf(carrier(photo("a"))))
        e2ee.flow.value = e2ee.flow.value.copy(encryptionMode = "e2ee")
        e2ee.controller.openPiece("m1", "a")
        e2ee.controller.toggleRecipient("c2")
        e2ee.controller.sendSelection()
        advanceUntilIdle()
        assertThat(e2ee.forward?.refusal).isEqualTo(ForwardRefusalReason.ENCRYPTED_SOURCE)
        coVerify(exactly = 0) { e2ee.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a piece caption leaves as a separate message after the piece`() = runTest {
        val r = rig(listOf(carrier(photo("a"))))
        r.controller.openPiece("m1", "a")
        r.controller.onCaptionChange("regarde")

        r.shareTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", "", "fr", me, null, null, "m1", "c1", forwardedAttachmentIds = listOf("a")) }
        coVerify(exactly = 1) { r.repo.sendOptimistic("c2", "regarde", any(), any(), any(), any(), any(), any()) }
    }
}
