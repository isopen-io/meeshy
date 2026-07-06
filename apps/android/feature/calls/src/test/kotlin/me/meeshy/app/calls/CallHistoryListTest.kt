package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallRecord
import org.junit.Test

class CallHistoryListTest {

    private fun record(callId: String, direction: String = "incoming") = CallRecord(
        callId = callId,
        conversationId = "c-$callId",
        conversationType = "direct",
        mode = "p2p",
        status = "ended",
        direction = direction,
        isVideo = false,
        startedAt = "2026-07-01T10:00:00Z",
        durationSec = 42,
    )

    @Test
    fun `combine keeps stream then paged order`() {
        val stream = listOf(record("a"), record("b"))
        val paged = listOf(record("c"), record("d"))

        val combined = CallHistoryList.combine(stream, paged)

        assertThat(combined.map { it.callId }).containsExactly("a", "b", "c", "d").inOrder()
    }

    @Test
    fun `combine drops a paged record already present in the stream`() {
        val stream = listOf(record("a"), record("b"))
        val paged = listOf(record("b"), record("c"))

        val combined = CallHistoryList.combine(stream, paged)

        assertThat(combined.map { it.callId }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `combine of two empty lists is empty`() {
        assertThat(CallHistoryList.combine(emptyList(), emptyList())).isEmpty()
    }

    @Test
    fun `combine keeps the stream copy of a duplicated id`() {
        val streamCopy = record("a", direction = "incoming")
        val pagedCopy = record("a", direction = "missed")

        val combined = CallHistoryList.combine(listOf(streamCopy), listOf(pagedCopy))

        assertThat(combined).hasSize(1)
        assertThat(combined.single().direction).isEqualTo("incoming")
    }

    @Test
    fun `filter without missedOnly returns every record`() {
        val records = listOf(record("a", "incoming"), record("b", "missed"), record("c", "outgoing"))

        assertThat(CallHistoryList.filter(records, missedOnly = false)).isEqualTo(records)
    }

    @Test
    fun `filter with missedOnly keeps only missed records`() {
        val records = listOf(record("a", "incoming"), record("b", "missed"), record("c", "missed"))

        val filtered = CallHistoryList.filter(records, missedOnly = true)

        assertThat(filtered.map { it.callId }).containsExactly("b", "c").inOrder()
    }

    @Test
    fun `filter with missedOnly over no missed records is empty`() {
        val records = listOf(record("a", "incoming"), record("c", "outgoing"))

        assertThat(CallHistoryList.filter(records, missedOnly = true)).isEmpty()
    }
}
