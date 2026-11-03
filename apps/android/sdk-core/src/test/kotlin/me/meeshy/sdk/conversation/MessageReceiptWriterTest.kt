package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ReadStatusSummary
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
        MessageReceiptWriter(harness.database, harness.database.messageDao(), null)

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

    // ── Le résumé d'accusé d'UN message (#7433) ──

    private fun summary(messageId: String? = null, total: Int = 3, delivered: Int = 2, read: Int = 1, readByAllAt: String? = null) =
        ReadStatusSummary(totalMembers = total, deliveredCount = delivered, readCount = read, messageId = messageId, readByAllAt = readByAllAt)

    @Test
    fun `a named summary moves only the message it names and adopts the denominator`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1))
        harness.seedSynced(message("m2", T2))

        val changed = writer(harness).applyReadStatusSummary("c1", summary(messageId = "m1"), "me")

        assertThat(changed).isTrue()
        assertThat(harness.cachedMessage("m1").readCount).isEqualTo(1)
        assertThat(harness.cachedMessage("m1").recipientCount).isEqualTo(3)
        assertThat(harness.cachedMessage("m2").readCount).isEqualTo(0)
    }

    @Test
    fun `an unnamed summary lands on the latest acknowledged message and never on an in-flight send`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1))
        harness.seedSynced(message("m2", T2))
        harness.database.messageDao().upsertAll(
            listOf(MessageEntityFactory.local(message("cid_1", T4), harness.clock.now, LocalSendState.SENDING)),
        )

        val changed = writer(harness).applyReadStatusSummary("c1", summary(), "me")

        assertThat(changed).isTrue()
        assertThat(harness.cachedMessage("m2").readCount).isEqualTo(1)
        assertThat(harness.cachedMessage("m1").readCount).isEqualTo(0)
        assertThat(harness.cachedMessage("cid_1").readCount).isEqualTo(0)
    }

    @Test
    fun `a summary about a message of someone else changes nothing`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1, senderId = "other"))

        val changed = writer(harness).applyReadStatusSummary("c1", summary(messageId = "m1"), "me")

        assertThat(changed).isFalse()
        assertThat(harness.cachedMessage("m1").readCount).isEqualTo(0)
    }

    @Test
    fun `replaying the same summary reports no change and an older one never goes back`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1))
        val writer = writer(harness)
        writer.applyReadStatusSummary("c1", summary(messageId = "m1", delivered = 3, read = 2, readByAllAt = T2), "me")

        val replay = writer.applyReadStatusSummary("c1", summary(messageId = "m1", delivered = 3, read = 2, readByAllAt = T2), "me")
        val older = writer.applyReadStatusSummary("c1", summary(messageId = "m1", delivered = 1, read = 0), "me")

        assertThat(replay).isFalse()
        assertThat(older).isFalse()
        assertThat(harness.cachedMessage("m1").readCount).isEqualTo(2)
        assertThat(harness.cachedMessage("m1").readByAllAt).isEqualTo(T2)
    }

    @Test
    fun `a summary with no denominator asserts nothing`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1))

        val changed = writer(harness).applyReadStatusSummary("c1", summary(messageId = "m1", total = 0), "me")

        assertThat(changed).isFalse()
        assertThat(harness.cachedMessage("m1").deliveredCount).isEqualTo(0)
    }

    private companion object {
        const val T1 = "2026-06-01T10:00:00Z"
        const val T2 = "2026-06-01T11:00:00Z"
        const val T3 = "2026-06-01T12:00:00Z"
        const val T4 = "2026-06-01T13:00:00Z"
    }
}
