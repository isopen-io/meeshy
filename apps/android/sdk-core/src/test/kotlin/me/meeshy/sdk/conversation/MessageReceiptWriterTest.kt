package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Characterisation of the receipts as they behaved inside the monolithic repository: a
 * `read-status:updated` summary only moves own, server-acked messages at or before the
 * frontier, and only upward.
 */
@RunWith(RobolectricTestRunner::class)
class MessageReceiptWriterTest {

    private fun writer(harness: MessageCollaboratorHarness) =
        MessageReceiptWriter(harness.database, harness.database.messageDao())

    private fun message(id: String, createdAt: String, senderId: String = "me") =
        ApiMessage(id = id, conversationId = "c1", content = "salut", createdAt = createdAt, senderId = senderId)

    @Test
    fun `a receipt upgrades own messages up to the frontier and leaves the later ones`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1))
        harness.seedSynced(message("m2", T2))
        harness.seedSynced(message("m3", T4))

        writer(harness).applyReadReceipt("c1", "me", deliveredCount = 2, readCount = 1, frontierIso = T3)

        assertThat(harness.cachedMessage("m1").readCount).isEqualTo(1)
        assertThat(harness.cachedMessage("m1").deliveredCount).isEqualTo(2)
        assertThat(harness.cachedMessage("m2").readCount).isEqualTo(1)
        assertThat(harness.cachedMessage("m3").readCount).isEqualTo(0)
        assertThat(harness.cachedMessage("m3").deliveredCount).isEqualTo(0)
    }

    @Test
    fun `a receipt without a frontier reaches every own message`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1))
        harness.seedSynced(message("m3", T4))

        writer(harness).applyReadReceipt("c1", "me", deliveredCount = 1, readCount = 0, frontierIso = null)

        assertThat(harness.cachedMessage("m1").deliveredCount).isEqualTo(1)
        assertThat(harness.cachedMessage("m3").deliveredCount).isEqualTo(1)
    }

    @Test
    fun `a receipt leaves the messages of other senders untouched`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1, senderId = "other"))

        writer(harness).applyReadReceipt("c1", "me", deliveredCount = 1, readCount = 1, frontierIso = T2)

        assertThat(harness.cachedMessage("m1").readCount).isEqualTo(0)
        assertThat(harness.cachedMessage("m1").deliveredCount).isEqualTo(0)
    }

    @Test
    fun `a receipt skips a bubble the server does not know yet`() = runHarnessTest { harness ->
        harness.database.messageDao().upsertAll(
            listOf(MessageEntityFactory.local(message("cid_1", T1), harness.clock.now, LocalSendState.SENDING)),
        )

        writer(harness).applyReadReceipt("c1", "me", deliveredCount = 1, readCount = 1, frontierIso = T4)

        assertThat(harness.cachedMessage("cid_1").readCount).isEqualTo(0)
        assertThat(harness.cachedMessage("cid_1").deliveredCount).isEqualTo(0)
    }

    @Test
    fun `a receipt never downgrades a message that is already read`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1).copy(deliveredCount = 3, readCount = 2))

        writer(harness).applyReadReceipt("c1", "me", deliveredCount = 1, readCount = 0, frontierIso = T2)

        assertThat(harness.cachedMessage("m1").readCount).isEqualTo(2)
        assertThat(harness.cachedMessage("m1").deliveredCount).isEqualTo(3)
    }

    @Test
    fun `a delivered message is promoted to read but not the other way round`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1).copy(deliveredCount = 1))

        writer(harness).applyReadReceipt("c1", "me", deliveredCount = 1, readCount = 1, frontierIso = T2)

        assertThat(harness.cachedMessage("m1").readCount).isEqualTo(1)
    }

    @Test
    fun `a receipt with no delivery progress changes nothing`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1))

        writer(harness).applyReadReceipt("c1", "me", deliveredCount = 0, readCount = 0, frontierIso = T2)

        assertThat(harness.cachedMessage("m1").readCount).isEqualTo(0)
        assertThat(harness.cachedMessage("m1").deliveredCount).isEqualTo(0)
    }

    @Test
    fun `a receipt for one conversation never reaches another`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1).copy(conversationId = "c2"))

        writer(harness).applyReadReceipt("c1", "me", deliveredCount = 1, readCount = 1, frontierIso = T4)

        assertThat(harness.cachedMessage("m1").readCount).isEqualTo(0)
    }

    private companion object {
        const val T1 = "2026-06-01T10:00:00Z"
        const val T2 = "2026-06-01T11:00:00Z"
        const val T3 = "2026-06-01T12:00:00Z"
        const val T4 = "2026-06-01T13:00:00Z"
    }
}
