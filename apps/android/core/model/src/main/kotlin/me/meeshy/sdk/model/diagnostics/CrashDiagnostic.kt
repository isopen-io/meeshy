package me.meeshy.sdk.model.diagnostics

import kotlinx.serialization.Serializable

/**
 * Severity band of a captured incident — drives the badge colour on the diagnostics viewer
 * (`ERROR` → error red, `WARNING` → warning amber, `INFO` → info blue), mirroring the iOS
 * `CrashReportSheet.kindBadge` colour mapping. Kept as a pure enum so the colour SSOT stays
 * app-side (`MeeshyColors`) while the classification stays testable here.
 */
public enum class CrashSeverity {
    ERROR,
    WARNING,
    INFO,
}

/**
 * The kinds of on-device incident the app captures, the Android analogue of the iOS
 * `CrashDiagnostic.Kind` set. [EXCEPTION] (an uncaught JVM exception) is the one captured today via
 * the default uncaught-exception handler; the remaining kinds mirror the iOS classification so the
 * viewer and share format are forward-compatible with future ANR/native/CPU/disk capture.
 *
 * Each kind maps to a stable [severity] (badge colour) and a stable lowercase [wireValue] (the
 * `[kind]` header token in the shareable text). Both are frozen contracts — the tests pin every arm.
 */
public enum class CrashKind(public val severity: CrashSeverity, public val wireValue: String) {
    EXCEPTION(CrashSeverity.ERROR, "exception"),
    CRASH(CrashSeverity.ERROR, "crash"),
    ANR(CrashSeverity.WARNING, "anr"),
    CPU(CrashSeverity.WARNING, "cpu"),
    DISK(CrashSeverity.INFO, "disk"),
}

/**
 * A single captured incident, persisted as JSON and surfaced in the diagnostics viewer. Timestamps
 * are stored as epoch millis (formatted to ISO-8601 only at share/display time by
 * [CrashReportFormatter]); [details] holds the full stack trace or platform payload.
 */
@Serializable
public data class CrashDiagnostic(
    val id: String,
    val timestampMillis: Long,
    val kind: CrashKind,
    val summary: String,
    val details: String,
)
