package me.meeshy.sdk.model.diagnostics

import java.time.Instant

/**
 * Formats captured incidents into the shareable plain-text report — the pure port of the iOS
 * `CrashReportSheet.formatAllReports()`. One block per report:
 *
 * ```
 * [<kind>] <ISO-8601 UTC timestamp>
 * <summary>
 * <details>
 * ```
 *
 * Blocks are joined by a `---` fence. The formatter is order-preserving — the caller passes the
 * already-sorted display order (see [CrashReportRetention]); an empty list yields an empty string.
 */
public object CrashReportFormatter {

    private const val SEPARATOR = "\n\n---\n\n"

    public fun format(diagnostic: CrashDiagnostic): String =
        buildString {
            append('[').append(diagnostic.kind.wireValue).append("] ")
            append(Instant.ofEpochMilli(diagnostic.timestampMillis).toString())
            append('\n').append(diagnostic.summary)
            append('\n').append(diagnostic.details)
        }

    public fun formatAll(diagnostics: List<CrashDiagnostic>): String =
        diagnostics.joinToString(SEPARATOR, transform = ::format)
}
