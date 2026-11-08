package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxChatLanes
import me.meeshy.sdk.outbox.OutboxEnqueueResult
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.Test

class MessageMutationsRepositoryTest {

    private val messages = mockk<MessageRepository>(relaxed = true)
    private val outbox = mockk<OutboxRepository>()
    private val sent = slot<OutboxMutation>()

    private fun answering(result: OutboxEnqueueResult): MessageMutationsRepository {
        coEvery { outbox.tryEnqueue(capture(sent), any()) } returns result
        return MessageMutationsRepository(outbox, messages, MeeshyApi.json)
    }

    private val accepted = OutboxEnqueueResult.Accepted("cmid_1")

    @Test
    fun `hiding for me tombstones the bubble then queues the mutation on the hiding lane`() = runTest {
        val result = answering(accepted).hideForMe("c1", "m1")

        assertThat(result).isEqualTo(ChatMutationAdmission.QUEUED)
        coVerify(exactly = 1) { messages.markDeleted("m1", any()) }
        assertThat(sent.captured.kind).isEqualTo(OutboxKind.HIDE_FOR_ME)
        assertThat(sent.captured.lane).isEqualTo(OutboxChatLanes.PERSONAL_HIDING)
        assertThat(sent.captured.targetId).isEqualTo("m1")
        assertThat(MeeshyApi.json.parseToJsonElement(sent.captured.payload).jsonObject["conversationId"]?.jsonPrimitive?.content)
            .isEqualTo("c1")
    }

    @Test
    fun `a full queue gives the bubble back`() = runTest {
        val result = answering(OutboxEnqueueResult.QueueFull(500, 500)).hideForMe("c1", "m1")

        assertThat(result).isEqualTo(ChatMutationAdmission.REFUSED)
        coVerify(exactly = 1) { messages.markUndeleted("m1") }
        coVerify(exactly = 1) { messages.refresh("c1") }
    }

    @Test
    fun `restoring a message whose hiding is still queued cancels both and lifts the tombstone`() = runTest {
        val result = answering(OutboxEnqueueResult.Annihilated).restoreForMe("c1", "m1")

        assertThat(result).isEqualTo(ChatMutationAdmission.CANCELLED_OUT)
        coVerify(exactly = 1) { messages.markUndeleted("m1") }
    }

    @Test
    fun `restoring a message already hidden on the server only queues the request`() = runTest {
        val result = answering(accepted).restoreForMe("c1", "m1")

        assertThat(result).isEqualTo(ChatMutationAdmission.QUEUED)
        assertThat(sent.captured.kind).isEqualTo(OutboxKind.RESTORE_FOR_ME)
        coVerify(exactly = 0) { messages.markUndeleted(any()) }
    }

    @Test
    fun `removing an attachment queues it under the piece id`() = runTest {
        val result = answering(accepted).removeAttachment("c1", "m1", "a1")

        assertThat(result).isEqualTo(ChatMutationAdmission.QUEUED)
        assertThat(sent.captured.kind).isEqualTo(OutboxKind.REMOVE_ATTACHMENT)
        assertThat(sent.captured.targetId).isEqualTo("a1")
        assertThat(sent.captured.lane).isEqualTo(OutboxChatLanes.CONTENT_REMOVAL)
    }

    @Test
    fun `a moderation removal trims its reason and a blank one touches nothing`() = runTest {
        val repository = answering(accepted)

        assertThat(repository.moderationDelete("c1", "m1", "   ")).isEqualTo(ChatMutationAdmission.REFUSED)
        coVerify(exactly = 0) { messages.markDeleted(any(), any()) }

        assertThat(repository.moderationDelete("c1", "m1", "  spam ")).isEqualTo(ChatMutationAdmission.QUEUED)
        assertThat(sent.captured.kind).isEqualTo(OutboxKind.MODERATION_DELETE)
        assertThat(MeeshyApi.json.parseToJsonElement(sent.captured.payload).jsonObject["reason"]?.jsonPrimitive?.content)
            .isEqualTo("spam")
    }

    @Test
    fun `marking received rides the read-receipt lane keyed by the conversation`() = runTest {
        val result = answering(accepted).markReceived("c1")

        assertThat(result).isEqualTo(ChatMutationAdmission.QUEUED)
        assertThat(sent.captured.kind).isEqualTo(OutboxKind.MARK_RECEIVED)
        assertThat(sent.captured.lane).isEqualTo(OutboxLanes.READ_RECEIPT)
        assertThat(sent.captured.targetId).isEqualTo("c1")
    }
}
