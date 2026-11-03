package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReadStatusReceiptTest {

    private fun summary(messageId: String? = null, total: Int = 2, delivered: Int = 1, read: Int = 1) =
        ReadStatusSummary(totalMembers = total, deliveredCount = delivered, readCount = read, messageId = messageId)

    @Test
    fun `a named summary describes the message it names, not the latest of the thread`() {
        assertThat(ReadStatusReceipt.describedMessageId(summary(messageId = "m5"), latestMessageId = "m20")).isEqualTo("m5")
    }

    @Test
    fun `an old unnamed summary falls back to the latest message of the thread`() {
        assertThat(ReadStatusReceipt.describedMessageId(summary(), latestMessageId = "m20")).isEqualTo("m20")
    }

    @Test
    fun `a summary with no denominator describes nothing`() {
        assertThat(ReadStatusReceipt.describedMessageId(summary(messageId = "m5", total = 0), latestMessageId = "m20")).isNull()
    }

    @Test
    fun `the event timestamp never selects messages`() {
        val event = ReadStatusUpdatedEvent(conversationId = "c", participantId = "p", updatedAt = "2026-01-01T00:00:00Z", summary = summary(messageId = "m5"))
        assertThat(ReadStatusReceipt.describedMessageId(event.summary, latestMessageId = "m20")).isEqualTo("m5")
    }

    @Test
    fun `merging never makes a tick go back and adopts the denominator`() {
        val held = ReceiptCounters(deliveredCount = 3, readCount = 2, recipientCount = 0)
        val merged = ReadStatusReceipt.merged(held, summary(total = 4, delivered = 1, read = 1))
        assertThat(merged.deliveredCount).isEqualTo(3)
        assertThat(merged.readCount).isEqualTo(2)
        assertThat(merged.recipientCount).isEqualTo(4)
    }
}
