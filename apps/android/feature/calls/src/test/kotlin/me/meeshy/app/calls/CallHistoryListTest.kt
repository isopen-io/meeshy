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

    @Test
    fun `empty kind says no calls on a cold empty journal`() {
        assertThat(CallHistoryEmptyKind.of(CallHistoryUiState())).isEqualTo(CallHistoryEmptyKind.NO_CALLS)
    }

    @Test
    fun `empty kind says no missed calls under the missed filter`() {
        assertThat(CallHistoryEmptyKind.of(CallHistoryUiState(missedOnly = true))).isEqualTo(CallHistoryEmptyKind.NO_MISSED_CALLS)
    }

    @Test
    fun `empty kind says no results while searching even under the missed filter`() {
        val state = CallHistoryUiState(missedOnly = true, searchQuery = "zoe")
        assertThat(CallHistoryEmptyKind.of(state)).isEqualTo(CallHistoryEmptyKind.NO_RESULTS)
    }

    @Test
    fun `visible merges the server answer with the loaded lines, newest first, without duplicates`() {
        val loaded = listOf(record("a").copy(startedAt = "2026-07-03T10:00:00Z"))
        val server = listOf(
            record("old").copy(startedAt = "2026-05-01T10:00:00Z"),
            record("a").copy(startedAt = "2026-07-03T10:00:00Z"),
        )

        val shown = CallHistoryList.visible(
            records = loaded,
            query = me.meeshy.sdk.model.call.CallJournalQuery(),
            hidden = emptySet(),
            fallbackName = "Inconnu",
            searched = server,
        )

        assertThat(shown.map { it.callId }).containsExactly("a", "old").inOrder()
    }

    @Test
    fun `visible keeps a line the reader erased off the server answer`() {
        val shown = CallHistoryList.visible(
            records = emptyList(),
            query = me.meeshy.sdk.model.call.CallJournalQuery(),
            hidden = setOf("old"),
            fallbackName = "Inconnu",
            searched = listOf(record("old")),
        )

        assertThat(shown).isEmpty()
    }
}
