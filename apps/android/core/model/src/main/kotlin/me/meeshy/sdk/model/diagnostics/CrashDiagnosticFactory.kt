package me.meeshy.sdk.model.diagnostics

import java.io.PrintWriter
import java.io.StringWriter

/**
 * Turns a caught [Throwable] into a persisted [CrashDiagnostic] — the pure port of the iOS
 * NSException capture path (`"\(name): \(reason ?? "no reason")"` for the summary, the joined
 * call-stack symbols for the details). The id and timestamp are injected so the conversion is
 * deterministic and fully testable off the crashing thread's real clock/UUID source.
 */
public object CrashDiagnosticFactory {

    private const val NO_MESSAGE = "no message"

    public fun fromThrowable(throwable: Throwable, id: String, timestampMillis: Long): CrashDiagnostic =
        CrashDiagnostic(
            id = id,
            timestampMillis = timestampMillis,
            kind = CrashKind.EXCEPTION,
            summary = "${throwable.javaClass.name}: ${throwable.message ?: NO_MESSAGE}",
            details = stackTraceText(throwable),
        )

    private fun stackTraceText(throwable: Throwable): String {
        val writer = StringWriter()
        PrintWriter(writer).use(throwable::printStackTrace)
        return writer.toString().trimEnd()
    }
}
