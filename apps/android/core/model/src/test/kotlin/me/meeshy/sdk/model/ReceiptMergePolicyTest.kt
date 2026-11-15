package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReceiptMergePolicyTest {

    private fun counters(
        delivered: Int = 0,
        read: Int = 0,
        recipients: Int = 0,
        deliveredToAllAt: String? = null,
        readByAllAt: String? = null,
    ) = ReceiptCounters(delivered, read, recipients, deliveredToAllAt, readByAllAt)

    private fun message(c: ReceiptCounters) =
        ReceiptMergePolicy.withCounters(ApiMessage(id = "m1", conversationId = "c1", content = "x"), c)

    @Test
    fun `a strictly better counter replaces the held one`() {
        val merged = ReceiptMergePolicy.merged(counters(delivered = 1), counters(delivered = 2, read = 1))

        assertThat(merged.deliveredCount).isEqualTo(2)
        assertThat(merged.readCount).isEqualTo(1)
    }

    @Test
    fun `an older answer never makes a tick go back`() {
        val held = counters(delivered = 3, read = 2, recipients = 3, deliveredToAllAt = D1, readByAllAt = D2)

        val merged = ReceiptMergePolicy.merged(held, counters(delivered = 1, recipients = 3))

        assertThat(merged).isEqualTo(held)
    }

    @Test
    fun `equal counters change nothing`() {
        val held = counters(delivered = 2, read = 1, recipients = 2, readByAllAt = D1)

        assertThat(ReceiptMergePolicy.merged(held, held)).isEqualTo(held)
    }

    @Test
    fun `the first all-marker is kept and a missing one is adopted`() {
        val held = counters(deliveredToAllAt = D1)

        val merged = ReceiptMergePolicy.merged(held, counters(deliveredToAllAt = D2, readByAllAt = D2))

        assertThat(merged.deliveredToAllAt).isEqualTo(D1)
        assertThat(merged.readByAllAt).isEqualTo(D2)
    }

    @Test
    fun `a positive served denominator is adopted and an unknown one never erases it`() {
        val held = counters(recipients = 4)

        assertThat(ReceiptMergePolicy.merged(held, counters(recipients = 5)).recipientCount).isEqualTo(5)
        assertThat(ReceiptMergePolicy.merged(held, counters(recipients = 0)).recipientCount).isEqualTo(4)
        assertThat(ReceiptMergePolicy.merged(counters(), counters(recipients = 3)).recipientCount).isEqualTo(3)
    }

    @Test
    fun `a batch gives the same result whatever the arrival order`() {
        val batch = listOf(counters(delivered = 1), counters(delivered = 3, read = 1), counters(read = 2, readByAllAt = D1))

        val forward = ReceiptMergePolicy.mergedAll(counters(), batch)
        val backward = ReceiptMergePolicy.mergedAll(counters(), batch.reversed())

        assertThat(forward).isEqualTo(backward)
        assertThat(forward).isEqualTo(counters(delivered = 3, read = 2, readByAllAt = D1))
    }

    @Test
    fun `applying returns the same message when nothing progresses`() {
        val held = message(counters(delivered = 2, read = 1, recipients = 2))

        assertThat(ReceiptMergePolicy.applying(held, counters(delivered = 1))).isSameInstanceAs(held)
    }

    @Test
    fun `applying a summary carries the denominator onto the message`() {
        val summary = ReadStatusSummary(totalMembers = 3, deliveredCount = 2, readCount = 1, readByAllAt = null)
        val held = message(counters())

        val next = with(ReceiptMergePolicy) { applying(held, summary.counters) }

        assertThat(next.recipientCount).isEqualTo(3)
        assertThat(next.deliveredCount).isEqualTo(2)
    }

    @Test
    fun `merging served messages never moves a tick back`() {
        val cached = message(counters(delivered = 2, read = 2, recipients = 2, readByAllAt = D1))
        val stale = message(counters(delivered = 1, recipients = 2))

        val outcome = MessageMergePolicy.merge(existing = cached, incoming = stale)

        assertThat(outcome.message.readCount).isEqualTo(2)
        assertThat(outcome.message.readByAllAt).isEqualTo(D1)
        assertThat(outcome.message.recipientCount).isEqualTo(2)
    }

    @Test
    fun `a summary that names nobody asserts nothing`() {
        assertThat(ReceiptMergePolicy.describes(ReadStatusSummary(totalMembers = 0, deliveredCount = 1))).isFalse()
        assertThat(ReceiptMergePolicy.describes(ReadStatusSummary(totalMembers = 2))).isTrue()
    }

    private companion object {
        const val D1 = "2026-06-01T10:00:00Z"
        const val D2 = "2026-06-01T11:00:00Z"
    }
}
