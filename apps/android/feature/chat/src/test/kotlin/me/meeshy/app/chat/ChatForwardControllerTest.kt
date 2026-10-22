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

    private fun TestScope.rig(loaded: List<LocalMessage> = listOf(source())): Rig {
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
}
