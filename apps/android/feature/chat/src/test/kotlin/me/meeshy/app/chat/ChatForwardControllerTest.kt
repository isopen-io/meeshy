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
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.share.ShareDelivery
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

    private fun TestScope.rig(loaded: List<LocalMessage> = listOf(source()), blocked: Set<String> = emptySet()): Rig {
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
            messages = MutableStateFlow(loaded),
            messageRepository = repo,
            sessionRepository = session,
            workManager = workManager,
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

    @Test
    fun `forwarding re-sends the original into the target, queues the flush and ticks the row`() = runTest {
        val r = rig()
        r.controller.open("m1")

        r.controller.forwardTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 1) {
            r.repo.sendOptimistic("c2", "salut", "fr", me, null, null, "m1", "c1")
        }
        verify(exactly = 1) { r.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
        assertThat(r.forward?.sentConversationIds).containsExactly("c2")
        assertThat(r.forward?.sendingConversationId).isNull()
    }

    @Test
    fun `one forward is in flight per message and an already forwarded target is inert`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<String>()
        coEvery { r.repo.sendOptimistic("c2", any(), any(), any(), any(), any(), any(), any()) } coAnswers { gate.await() }
        r.controller.open("m1")

        r.controller.forwardTo("c2")
        runCurrent()
        r.controller.forwardTo("c3")
        r.controller.forwardTo("c2")
        assertThat(r.forward?.sendingConversationId).isEqualTo("c2")

        gate.complete("cmid_2")
        advanceUntilIdle()
        r.controller.forwardTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `the in-flight guard survives closing and reopening the picker`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<String>()
        coEvery { r.repo.sendOptimistic("c2", any(), any(), any(), any(), any(), any(), any()) } coAnswers { gate.await() }
        r.controller.open("m1")
        r.controller.forwardTo("c2")
        runCurrent()

        r.controller.close()
        r.controller.open("m1")
        r.controller.forwardTo("c3")
        runCurrent()

        assertThat(r.forward?.sendingConversationId).isEqualTo("c2")
        coVerify(exactly = 1) { r.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
        gate.complete("cmid_2")
        advanceUntilIdle()
    }

    @Test
    fun `a message the server has not acknowledged yet cannot be forwarded`() = runTest {
        val r = rig(loaded = listOf(source(sendState = LocalSendState.SENDING)))
        r.controller.open("m1")

        r.controller.forwardTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 0) { r.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
        assertThat(r.forward?.sendingConversationId).isNull()
    }

    @Test
    fun `a failed forward surfaces the error, frees the picker and can be retried`() = runTest {
        val r = rig()
        coEvery { r.repo.sendOptimistic("c2", any(), any(), any(), any(), any(), any(), any()) } throws RuntimeException("offline")
        r.controller.open("m1")

        r.controller.forwardTo("c2")
        advanceUntilIdle()

        assertThat(r.state.errorMessage).isEqualTo("offline")
        assertThat(r.forward?.sendingConversationId).isNull()
        assertThat(r.forward?.sentConversationIds).isEmpty()

        coEvery { r.repo.sendOptimistic("c2", any(), any(), any(), any(), any(), any(), any()) } returns "cmid_3"
        r.controller.forwardTo("c2")
        advanceUntilIdle()
        assertThat(r.forward?.sentConversationIds).containsExactly("c2")
    }

    @Test
    fun `with the picker closed a forward is inert`() = runTest {
        val r = rig()

        r.controller.forwardTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 0) { r.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a multi-selection forward carries every message the exit law lets out, in order`() = runTest {
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
        assertThat(r.forward?.additionalSourceMessageIds).containsExactly("m2")
        assertThat(r.forward?.refusal).isNull()

        r.controller.forwardTo("c2")
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
        assertThat(r.forward?.sentConversationIds).containsExactly("c2", "c3")
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
}
