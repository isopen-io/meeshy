package me.meeshy.sdk.model.diagnostics

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [CrashReportRetention] is the pure port of the iOS `decodeAllReports()` sort-newest-first + cap +
 * garbage-collect-the-overflow logic. It keeps the store bounded so a crash loop can't grow the
 * on-disk file without limit, and it is the single source of newest-first display order.
 */
class CrashReportRetentionTest {

    private fun diag(id: String, millis: Long) =
        CrashDiagnostic(id = id, timestampMillis = millis, kind = CrashKind.EXCEPTION, summary = id, details = "")

    @Test
    fun sorted_emptyList_isEmpty() {
        assertThat(CrashReportRetention.sorted(emptyList())).isEmpty()
    }

    @Test
    fun sorted_singleElement_isItself() {
        val one = diag("a", 10L)
        assertThat(CrashReportRetention.sorted(listOf(one))).containsExactly(one)
    }

    @Test
    fun sorted_ordersNewestFirst() {
        val old = diag("old", 100L)
        val new = diag("new", 300L)
        val mid = diag("mid", 200L)

        assertThat(CrashReportRetention.sorted(listOf(old, new, mid)))
            .containsExactly(new, mid, old)
            .inOrder()
    }

    @Test
    fun sorted_sameTimestamp_tieBrokenDeterministicallyByIdDescending() {
        val a = diag("a", 100L)
        val b = diag("b", 100L)

        assertThat(CrashReportRetention.sorted(listOf(a, b)))
            .containsExactly(b, a)
            .inOrder()
    }

    @Test
    fun retained_underCap_keepsAllNewestFirst() {
        val reports = (1..3).map { diag("id$it", it.toLong()) }

        assertThat(CrashReportRetention.retained(reports, cap = 50).map { it.id })
            .containsExactly("id3", "id2", "id1")
            .inOrder()
    }

    @Test
    fun retained_atCapBoundary_keepsExactlyCap() {
        val reports = (1..5).map { diag("id$it", it.toLong()) }

        val kept = CrashReportRetention.retained(reports, cap = 5)

        assertThat(kept).hasSize(5)
    }

    @Test
    fun retained_overCap_dropsOldestBeyondCap() {
        val reports = (1..5).map { diag("id$it", it.toLong()) }

        val kept = CrashReportRetention.retained(reports, cap = 3)

        assertThat(kept.map { it.id }).containsExactly("id5", "id4", "id3").inOrder()
    }

    @Test
    fun retained_capZeroOrNegative_isEmpty() {
        val reports = (1..3).map { diag("id$it", it.toLong()) }

        assertThat(CrashReportRetention.retained(reports, cap = 0)).isEmpty()
        assertThat(CrashReportRetention.retained(reports, cap = -1)).isEmpty()
    }

    @Test
    fun overflowIds_underCap_isEmpty() {
        val reports = (1..3).map { diag("id$it", it.toLong()) }

        assertThat(CrashReportRetention.overflowIds(reports, cap = 50)).isEmpty()
    }

    @Test
    fun overflowIds_overCap_returnsOldestIdsBeyondCap() {
        val reports = (1..5).map { diag("id$it", it.toLong()) }

        assertThat(CrashReportRetention.overflowIds(reports, cap = 3))
            .containsExactly("id2", "id1")
            .inOrder()
    }

    @Test
    fun overflowIds_capZeroOrNegative_returnsEveryId() {
        val reports = (1..3).map { diag("id$it", it.toLong()) }

        assertThat(CrashReportRetention.overflowIds(reports, cap = 0))
            .containsExactly("id3", "id2", "id1")
            .inOrder()
    }

    @Test
    fun maxStored_matchesIosCap() {
        assertThat(CrashReportRetention.MAX_STORED).isEqualTo(50)
    }
}
