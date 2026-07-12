package me.meeshy.sdk.model.diagnostics

/**
 * Pure retention policy for the persisted crash list — the port of the iOS `decodeAllReports()`
 * sort-newest-first + cap + garbage-collect-overflow logic. Applied both when reading (to bound the
 * viewer) and when appending (so a crash loop can never grow the on-disk file without limit).
 *
 * [sorted] is the single source of newest-first display order, with a deterministic id tie-break so
 * two incidents recorded in the same millisecond keep a stable order across reads.
 */
public object CrashReportRetention {

    /** Hard cap on stored reports, matching the iOS `maxStoredReports`. */
    public const val MAX_STORED: Int = 50

    public fun sorted(reports: List<CrashDiagnostic>): List<CrashDiagnostic> =
        reports.sortedWith(
            compareByDescending<CrashDiagnostic> { it.timestampMillis }.thenByDescending { it.id },
        )

    /** The newest-first reports kept within [cap]; a non-positive cap keeps nothing. */
    public fun retained(reports: List<CrashDiagnostic>, cap: Int = MAX_STORED): List<CrashDiagnostic> =
        sorted(reports).take(cap.coerceAtLeast(0))

    /** The ids of the oldest reports beyond [cap] — the entries to garbage-collect. */
    public fun overflowIds(reports: List<CrashDiagnostic>, cap: Int = MAX_STORED): List<String> =
        sorted(reports).drop(cap.coerceAtLeast(0)).map { it.id }
}
