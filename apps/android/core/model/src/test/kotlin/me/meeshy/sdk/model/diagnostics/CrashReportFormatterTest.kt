package me.meeshy.sdk.model.diagnostics

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [CrashReportFormatter] is the pure port of the iOS `CrashReportSheet.formatAllReports()` share
 * text: one block per report (`[kind] ISO-timestamp` / summary / details), blocks joined by a
 * `---` separator. The formatter never re-orders — the caller supplies the display order.
 */
class CrashReportFormatterTest {

    private fun diag(
        id: String = "id",
        kind: CrashKind = CrashKind.EXCEPTION,
        millis: Long = 0L,
        summary: String = "summary",
        details: String = "details",
    ) = CrashDiagnostic(id = id, timestampMillis = millis, kind = kind, summary = summary, details = details)

    @Test
    fun format_oneReport_hasHeaderSummaryDetails() {
        val text = CrashReportFormatter.format(diag(kind = CrashKind.ANR, millis = 0L, summary = "Hang", details = "stack"))

        assertThat(text).isEqualTo(
            """
            [anr] 1970-01-01T00:00:00Z
            Hang
            stack
            """.trimIndent(),
        )
    }

    @Test
    fun formatAll_emptyList_isEmptyString() {
        assertThat(CrashReportFormatter.formatAll(emptyList())).isEmpty()
    }

    @Test
    fun formatAll_singleReport_hasNoSeparator() {
        val text = CrashReportFormatter.formatAll(listOf(diag(summary = "solo")))

        assertThat(text).contains("solo")
        assertThat(text).doesNotContain("---")
    }

    @Test
    fun formatAll_multipleReports_joinedBySeparator_inGivenOrder() {
        val text = CrashReportFormatter.formatAll(
            listOf(
                diag(id = "a", summary = "first"),
                diag(id = "b", summary = "second"),
            ),
        )

        assertThat(text).isEqualTo(
            CrashReportFormatter.format(diag(id = "a", summary = "first")) +
                "\n\n---\n\n" +
                CrashReportFormatter.format(diag(id = "b", summary = "second")),
        )
        assertThat(text.indexOf("first")).isLessThan(text.indexOf("second"))
    }

    @Test
    fun format_usesIso8601UtcForTimestamp() {
        val text = CrashReportFormatter.format(diag(millis = 1_720_000_000_000L))

        assertThat(text).contains("2024-07-03T")
        assertThat(text).contains("Z")
    }
}
