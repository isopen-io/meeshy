package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.api.AddReactionRequest
import me.meeshy.sdk.net.api.ReactionApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.ReactionPayload
import me.meeshy.sdk.outbox.SendResult
import org.junit.Test
import java.io.IOException

class ReactionSendersTest {

    private val reactionApi = mockk<ReactionApi>()

    private fun row(kind: OutboxKind, payload: String = encodedPayload(ReactionPayload("🔥"))) =
        outboxRow(kind, targetId = "m1", payload = payload)

    @Test
    fun `add reaction posts the payload emoji on the row message`() = runTest {
        val handler = AddReactionHandler(reactionApi, senderJson)
        coEvery { reactionApi.add(AddReactionRequest(messageId = "m1", emoji = "🔥")) } returns accepted(Unit)

        val result = handler.send(row(OutboxKind.ADD_REACTION))

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify(exactly = 1) { reactionApi.add(AddReactionRequest(messageId = "m1", emoji = "🔥")) }
    }

    @Test
    fun `add reaction stays retryable on a refusal or a dropped connection`() = runTest {
        val handler = AddReactionHandler(reactionApi, senderJson)

        coEvery { reactionApi.add(any()) } returns refused()
        assertThat(handler.send(row(OutboxKind.ADD_REACTION))).isEqualTo(SendResult.TransientFailure)

        coEvery { reactionApi.add(any()) } throws IOException("offline")
        assertThat(handler.send(row(OutboxKind.ADD_REACTION))).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `add reaction with an undecodable payload fails permanently`() = runTest {
        val handler = AddReactionHandler(reactionApi, senderJson)

        val result = handler.send(row(OutboxKind.ADD_REACTION, payload = "nope"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        coVerify(exactly = 0) { reactionApi.add(any()) }
    }

    @Test
    fun `remove reaction deletes the payload emoji from the row message`() = runTest {
        val handler = RemoveReactionHandler(reactionApi, senderJson)
        coEvery { reactionApi.remove("m1", "🔥") } returns accepted(Unit)

        assertThat(handler.send(row(OutboxKind.REMOVE_REACTION))).isEqualTo(SendResult.Success)

        coEvery { reactionApi.remove("m1", "🔥") } returns refused()
        assertThat(handler.send(row(OutboxKind.REMOVE_REACTION))).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `remove reaction with an undecodable payload fails permanently`() = runTest {
        val handler = RemoveReactionHandler(reactionApi, senderJson)

        val result = handler.send(row(OutboxKind.REMOVE_REACTION, payload = ""))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
