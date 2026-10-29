package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.AddReactionRequest
import me.meeshy.sdk.net.api.ReactionApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxPlaintextAdmission
import me.meeshy.sdk.outbox.ReactionPayload
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.reaction.OwnReactionWithdrawal
import me.meeshy.sdk.reaction.OwnReactionWithdrawals
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class ReactionSendersTest {

    private val reactionApi = mockk<ReactionApi>()
    private val messageRepository = mockk<MessageRepository>(relaxed = true)
    private val ledger = InMemoryEndToEndRegimeLedger()

    private fun row(kind: OutboxKind, payload: String = encodedPayload(ReactionPayload("🔥"))) =
        outboxRow(kind, targetId = "m1", payload = payload)

    @Test
    fun `add reaction posts the payload emoji on the row message`() = runTest {
        val handler = AddReactionHandler(reactionApi, messageRepository, senderJson, ledger)
        coEvery { reactionApi.add(AddReactionRequest(messageId = "m1", emoji = "🔥")) } returns accepted(Unit)

        val result = handler.send(row(OutboxKind.ADD_REACTION))

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify(exactly = 1) { reactionApi.add(AddReactionRequest(messageId = "m1", emoji = "🔥")) }
    }

    @Test
    fun `add reaction stays retryable on a refusal or a dropped connection`() = runTest {
        val handler = AddReactionHandler(reactionApi, messageRepository, senderJson, ledger)

        coEvery { reactionApi.add(any()) } returns refused()
        assertThat(handler.send(row(OutboxKind.ADD_REACTION))).isEqualTo(SendResult.TransientFailure)

        coEvery { reactionApi.add(any()) } throws IOException("offline")
        assertThat(handler.send(row(OutboxKind.ADD_REACTION))).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `add reaction with an undecodable payload fails permanently`() = runTest {
        val handler = AddReactionHandler(reactionApi, messageRepository, senderJson, ledger)

        val result = handler.send(row(OutboxKind.ADD_REACTION, payload = "nope"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        coVerify(exactly = 0) { reactionApi.add(any()) }
    }

    @Test
    fun `remove reaction deletes the payload emoji from the row message`() = runTest {
        val handler = RemoveReactionHandler(reactionApi, messageRepository, senderJson, ledger)
        coEvery { reactionApi.remove("m1", "🔥") } returns accepted(Unit)

        assertThat(handler.send(row(OutboxKind.REMOVE_REACTION))).isEqualTo(SendResult.Success)

        coEvery { reactionApi.remove("m1", "🔥") } returns refused()
        assertThat(handler.send(row(OutboxKind.REMOVE_REACTION))).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `remove reaction with an undecodable payload fails permanently`() = runTest {
        val handler = RemoveReactionHandler(reactionApi, messageRepository, senderJson, ledger)

        val result = handler.send(row(OutboxKind.REMOVE_REACTION, payload = ""))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `a reaction refused for want of the signal channel is final and seals its conversation`() = runTest {
        coEvery { reactionApi.add(any()) } returns signalChannelRequired()
        coEvery { reactionApi.remove(any(), any()) } returns signalChannelRequired()
        val payload = encodedPayload(ReactionPayload("🔥", conversationId = "c-e2ee"))

        val added = AddReactionHandler(reactionApi, messageRepository, senderJson, ledger).send(row(OutboxKind.ADD_REACTION, payload))
        val removed = RemoveReactionHandler(reactionApi, messageRepository, senderJson, ledger).send(row(OutboxKind.REMOVE_REACTION, payload))

        assertThat(added).isEqualTo(SendResult.PermanentFailure(OutboxPlaintextAdmission.REASON_SIGNAL_CHANNEL_REQUIRED))
        assertThat(removed).isEqualTo(SendResult.PermanentFailure(OutboxPlaintextAdmission.REASON_SIGNAL_CHANNEL_REQUIRED))
        assertThat(ledger.isSealed("c-e2ee")).isTrue()
    }

    @Test
    fun `an exhausted reaction takes its optimistic chip back`() = runTest {
        AddReactionHandler(reactionApi, messageRepository, senderJson, ledger).onExhausted(row(OutboxKind.ADD_REACTION))
        RemoveReactionHandler(reactionApi, messageRepository, senderJson, ledger).onExhausted(row(OutboxKind.REMOVE_REACTION))

        coVerify(exactly = 1) { messageRepository.applyReactionDelta("m1", "🔥", -1) }
        coVerify(exactly = 1) { messageRepository.applyReactionDelta("m1", "🔥", 1) }
    }

    @Test
    fun `an exhausted reaction tells the open screen the viewer's mark is undone too`() = runTest {
        val withdrawals = OwnReactionWithdrawals()
        val heard = mutableListOf<OwnReactionWithdrawal>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { withdrawals.withdrawals.collect { heard += it } }

        AddReactionHandler(reactionApi, messageRepository, senderJson, ledger, withdrawals).onExhausted(row(OutboxKind.ADD_REACTION))
        RemoveReactionHandler(reactionApi, messageRepository, senderJson, ledger, withdrawals).onExhausted(row(OutboxKind.REMOVE_REACTION))
        AddReactionHandler(reactionApi, messageRepository, senderJson, ledger, withdrawals).onExhausted(row(OutboxKind.ADD_REACTION, payload = "nope"))

        assertThat(heard).containsExactly(
            OwnReactionWithdrawal("m1", "🔥", stillMine = false),
            OwnReactionWithdrawal("m1", "🔥", stillMine = true),
        ).inOrder()
    }

    @Test
    fun `an exhausted reaction whose payload cannot be read touches nothing`() = runTest {
        AddReactionHandler(reactionApi, messageRepository, senderJson, ledger).onExhausted(row(OutboxKind.ADD_REACTION, payload = "nope"))

        coVerify(exactly = 0) { messageRepository.applyReactionDelta(any(), any(), any()) }
    }

    private fun <T> signalChannelRequired(): ApiResponse<T> =
        ApiResponse(success = false, error = "canal de signaux requis", code = "E2EE_SIGNAL_CHANNEL_REQUIRED")
}
