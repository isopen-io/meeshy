package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OptimisticMessageStagerTest {

    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")

    private class RecordingSink : SendPreviewSink {
        val staged = mutableListOf<ApiMessage>()
        val rolledBack = mutableListOf<Pair<String, String>>()
        override suspend fun staged(message: ApiMessage) { staged += message }
        override suspend fun rolledBack(conversationId: String, sentId: String) { rolledBack += conversationId to sentId }
    }

    private fun coordinator(harness: MessageCollaboratorHarness, sink: SendPreviewSink?, outbox: OutboxRepository = harness.outbox) =
        MessageSendCoordinator(harness.database, harness.database.messageDao(), outbox, harness.clock, listPreviews = sink)

    @Test
    fun `a media bubble shows its local paths and its protection before the upload ends`() = runHarnessTest { harness ->
        val local = ApiMessageAttachment(id = "u1", fileName = "p.jpg", mimeType = "image/jpeg", fileUrl = "content://media/p.jpg")

        val cid = coordinator(harness, null).sendOptimistic(
            "c1", "", "fr", sender, messageType = "image", attachments = listOf(local),
            effects = MessageEffects(flags = MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.BLURRED), attachmentUploadCmids = listOf("cmid_up1"),
        )

        val bubble = harness.cachedMessage(cid)
        assertThat(bubble.attachments.single().fileUrl).isEqualTo("content://media/p.jpg")
        assertThat(bubble.isViewOnce).isTrue()
        assertThat(bubble.isBlurred).isTrue()
        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.SENDING.name)
    }

    @Test
    fun `the list preview learns the optimistic send`() = runHarnessTest { harness ->
        val sink = RecordingSink()

        val cid = coordinator(harness, sink).sendOptimistic("c1", "salut", "fr", sender)

        assertThat(sink.staged.map { it.id }).containsExactly(cid)
    }

    @Test
    fun `withdrawing a bubble removes only it and recomputes the preview`() = runHarnessTest { harness ->
        val sink = RecordingSink()
        val sends = coordinator(harness, sink)
        val first = sends.sendOptimistic("c1", "un", "fr", sender)
        val second = sends.sendOptimistic("c1", "deux", "fr", sender)

        sends.cancelPendingSend(second)

        assertThat(harness.database.messageDao().find(second)).isNull()
        assertThat(harness.database.messageDao().find(first)).isNotNull()
        assertThat(sink.rolledBack).containsExactly("c1" to second)
    }

    @Test
    fun `a failing preview never breaks the send`() = runHarnessTest { harness ->
        val broken = object : SendPreviewSink {
            override suspend fun staged(message: ApiMessage) = error("list unavailable")
            override suspend fun rolledBack(conversationId: String, sentId: String) = error("list unavailable")
        }

        val cid = coordinator(harness, broken).sendOptimistic("c1", "salut", "fr", sender)

        assertThat(harness.outbox.deliverable("message:c1").map { it.cmid }).containsExactly(cid)
    }

    @Test
    fun `a failed enqueue leaves a failed retryable bubble carrying the error`() = runHarnessTest { harness ->
        val broken = mockk<OutboxRepository>(relaxed = true)
        coEvery { broken.currentTicket() } returns null
        coEvery { broken.tryEnqueue(any(), any()) } throws IllegalStateException("disk full")

        val cid = coordinator(harness, null, broken).sendOptimistic("c1", "salut", "fr", sender)

        val row = harness.database.messageDao().find(cid)!!
        assertThat(row.sendState).isEqualTo(LocalSendState.FAILED.name)
        assertThat(row.lastError).isEqualTo("disk full")
    }
}
