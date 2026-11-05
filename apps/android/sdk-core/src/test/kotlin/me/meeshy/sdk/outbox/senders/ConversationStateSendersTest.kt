package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.ConversationRemoval
import me.meeshy.sdk.conversation.ConversationRemovalEvents
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.CoalesceDecision
import me.meeshy.sdk.outbox.OutboxCoalescer
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import org.junit.Test

class ConversationStateSendersTest {

    private val repository = mockk<ConversationRepository>(relaxed = true)
    private val events = ConversationRemovalEvents()

    private fun failure(status: Int?, code: String? = null) = NetworkResult.Failure(ApiError("boom", code, status))

    private fun row(kind: OutboxKind, snapshot: ApiConversation? = null, cmid: String = "k1") = outboxRow(
        kind,
        targetId = "c1",
        cmid = cmid,
        payload = encodedPayload(ConversationRemovalPayload(snapshot)),
    )

    private fun leave() = LeaveConversationHandler(repository, senderJson, events)

    @Test
    fun `a delivered leave leaves the queue`() = runTest {
        coEvery { repository.leave("c1") } returns NetworkResult.Success(Unit)

        assertThat(leave().send(row(OutboxKind.LEAVE_CONVERSATION))).isEqualTo(SendResult.Success)
    }

    @Test
    fun `each removal kind calls its own route`() = runTest {
        coEvery { repository.leave(any()) } returns NetworkResult.Success(Unit)
        coEvery { repository.deleteForMe(any()) } returns NetworkResult.Success(Unit)
        coEvery { repository.deleteForAll(any()) } returns NetworkResult.Success(Unit)

        leave().send(row(OutboxKind.LEAVE_CONVERSATION))
        DeleteConversationForMeHandler(repository, senderJson, events).send(row(OutboxKind.DELETE_CONVERSATION_FOR_ME))
        DeleteConversationForAllHandler(repository, senderJson, events).send(row(OutboxKind.DELETE_CONVERSATION_FOR_ALL))

        coVerify(exactly = 1) { repository.leave("c1") }
        coVerify(exactly = 1) { repository.deleteForMe("c1") }
        coVerify(exactly = 1) { repository.deleteForAll("c1") }
    }

    @Test
    fun `a definitive refusal of the gateway is permanent`() = runTest {
        listOf(400, 403, 422).forEach { status ->
            coEvery { repository.leave("c1") } returns failure(status, "FORBIDDEN")

            assertThat(leave().send(row(OutboxKind.LEAVE_CONVERSATION))).isInstanceOf(SendResult.PermanentFailure::class.java)
        }
    }

    @Test
    fun `a server error or a rate limit is transient and keeps the row`() = runTest {
        listOf(500, 503, 429).forEach { status ->
            coEvery { repository.leave("c1") } returns failure(status)

            assertThat(leave().send(row(OutboxKind.LEAVE_CONVERSATION))).isEqualTo(SendResult.TransientFailure)
        }
    }

    @Test
    fun `a conversation already gone counts as done, a proxy 404 is replayed`() = runTest {
        coEvery { repository.deleteForMe("c1") } returns failure(410)
        val handler = DeleteConversationForMeHandler(repository, senderJson, events)
        assertThat(handler.send(row(OutboxKind.DELETE_CONVERSATION_FOR_ME))).isEqualTo(SendResult.Success)

        coEvery { repository.deleteForMe("c1") } returns failure(404, "CONVERSATION_NOT_FOUND")
        assertThat(handler.send(row(OutboxKind.DELETE_CONVERSATION_FOR_ME))).isEqualTo(SendResult.Success)

        coEvery { repository.deleteForMe("c1") } returns failure(404, "HTTP_404")
        assertThat(handler.send(row(OutboxKind.DELETE_CONVERSATION_FOR_ME))).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `an exhausted removal gives the row back and tells the screen`() = runTest {
        val snapshot = ApiConversation(id = "c1", title = "Équipe")

        leave().onExhausted(row(OutboxKind.LEAVE_CONVERSATION, snapshot))

        coVerify { repository.remember(snapshot) }
    }

    @Test
    fun `the refusal reaches the screen with the removal that failed`() = runTest {
        events.refusals.test {
            DeleteConversationForAllHandler(repository, senderJson, events).onExhausted(row(OutboxKind.DELETE_CONVERSATION_FOR_ALL))

            val refusal = awaitItem()
            assertThat(refusal.conversationId).isEqualTo("c1")
            assertThat(refusal.removal).isEqualTo(ConversationRemoval.DELETE_FOR_ALL)
        }
    }

    @Test
    fun `a row with an unreadable payload restores nothing but still warns`() = runTest {
        val bad = outboxRow(OutboxKind.LEAVE_CONVERSATION, targetId = "c1", payload = "not json")

        leave().onExhausted(bad)

        coVerify(exactly = 0) { repository.remember(any()) }
    }

    @Test
    fun `two removals of the same conversation are two rows, never one`() {
        val first = row(OutboxKind.LEAVE_CONVERSATION, cmid = "k1")
        val second = row(OutboxKind.LEAVE_CONVERSATION, cmid = "k2")

        val decision = OutboxCoalescer.decide(second, listOf(first))

        assertThat(decision).isInstanceOf(CoalesceDecision.Enqueue::class.java)
        OutboxKind.entries.filter { it.name.startsWith("DELETE_CONVERSATION") }.forEach { kind ->
            val sibling = row(kind, cmid = "k3")
            assertThat(OutboxCoalescer.decide(row(kind, cmid = "k4"), listOf(sibling)))
                .isInstanceOf(CoalesceDecision.Enqueue::class.java)
        }
    }
}
