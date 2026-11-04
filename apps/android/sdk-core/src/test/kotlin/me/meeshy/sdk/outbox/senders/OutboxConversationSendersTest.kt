package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.UpdateConversationResponse
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationDetailsApi
import me.meeshy.sdk.net.api.UpdateConversationDetailsRequest
import me.meeshy.sdk.outbox.CreateConversationPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.UpdateConversationPayload
import org.junit.Test

class OutboxConversationSendersTest {

    private val repository = mockk<ConversationRepository>(relaxed = true)
    private val api = mockk<ConversationDetailsApi>()

    private fun createRow() = outboxRow(
        OutboxKind.CREATE_CONVERSATION,
        targetId = "pending_1",
        payload = encodedPayload(CreateConversationPayload("group", "Squad", listOf("u1", "u2"), "server")),
    )

    private fun failure(status: Int?, code: String? = null) = NetworkResult.Failure(ApiError("boom", code, status))

    @Test
    fun `a delivered creation swaps the optimistic row for the server one`() = runTest {
        val created = ApiConversation(id = "c-real")
        coEvery { repository.create("group", "Squad", listOf("u1", "u2"), "server") } returns NetworkResult.Success(created)

        val result = CreateConversationHandler(repository, senderJson).send(createRow())

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify { repository.reconcileCreated("pending_1", created) }
    }

    @Test
    fun `a transient failure keeps the optimistic row and retries`() = runTest {
        coEvery { repository.create(any(), any(), any(), any()) } returns failure(503)

        val result = CreateConversationHandler(repository, senderJson).send(createRow())

        assertThat(result).isEqualTo(SendResult.TransientFailure)
        coVerify(exactly = 0) { repository.discardPending(any()) }
    }

    @Test
    fun `a definitive refusal is permanent`() = runTest {
        coEvery { repository.create(any(), any(), any(), any()) } returns failure(403, "USER_BLOCKED")

        assertThat(CreateConversationHandler(repository, senderJson).send(createRow()))
            .isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `an exhausted creation removes the optimistic row`() = runTest {
        CreateConversationHandler(repository, senderJson).onExhausted(createRow())

        coVerify { repository.discardPending("pending_1") }
    }

    @Test
    fun `an update pushes only the changed fields`() = runTest {
        val row = outboxRow(
            OutboxKind.UPDATE_CONVERSATION,
            targetId = "c1",
            payload = encodedPayload(UpdateConversationPayload(title = "Nouveau")),
        )
        val expected = UpdateConversationDetailsRequest(title = "Nouveau")
        coEvery { api.updateDetails("c1", expected) } returns accepted(UpdateConversationResponse(id = "c1"))

        val result = UpdateConversationHandler(api, repository, senderJson).send(row)

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify { api.updateDetails("c1", expected) }
    }

    @Test
    fun `a refused update is retried when transient`() = runTest {
        val row = outboxRow(OutboxKind.UPDATE_CONVERSATION, targetId = "c1", payload = encodedPayload(UpdateConversationPayload(title = "x")))
        coEvery { api.updateDetails(any(), any()) } returns refused()

        assertThat(UpdateConversationHandler(api, repository, senderJson).send(row)).isEqualTo(SendResult.TransientFailure)
    }
}
