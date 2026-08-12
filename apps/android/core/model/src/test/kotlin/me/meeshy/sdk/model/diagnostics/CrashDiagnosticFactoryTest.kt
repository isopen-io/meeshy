package me.meeshy.sdk.model.diagnostics

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [CrashDiagnosticFactory.fromThrowable] is the pure port of the iOS NSException capture path
 * (`"\(name): \(reason ?? "no reason")"` + `callStackSymbols.joined`). It turns a caught
 * [Throwable] into a persisted [CrashDiagnostic] deterministically given an injected id + timestamp.
 */
class CrashDiagnosticFactoryTest {

    @Test
    fun fromThrowable_summaryIsClassAndMessage() {
        val diag = CrashDiagnosticFactory.fromThrowable(
            IllegalStateException("boom"),
            id = "id-1",
            timestampMillis = 1_720_000_000_000L,
        )

        assertThat(diag.summary).isEqualTo("java.lang.IllegalStateException: boom")
    }

    @Test
    fun fromThrowable_nullMessage_usesPlaceholder() {
        val diag = CrashDiagnosticFactory.fromThrowable(
            RuntimeException(),
            id = "id-2",
            timestampMillis = 0L,
        )

        assertThat(diag.summary).isEqualTo("java.lang.RuntimeException: no message")
    }

    @Test
    fun fromThrowable_detailsContainStackTrace() {
        val diag = CrashDiagnosticFactory.fromThrowable(
            IllegalArgumentException("bad arg"),
            id = "id-3",
            timestampMillis = 5L,
        )

        assertThat(diag.details).contains("java.lang.IllegalArgumentException: bad arg")
        assertThat(diag.details).contains("at ")
    }

    @Test
    fun fromThrowable_carriesInjectedIdTimestampAndExceptionKind() {
        val diag = CrashDiagnosticFactory.fromThrowable(
            Throwable("t"),
            id = "the-id",
            timestampMillis = 42L,
        )

        assertThat(diag.id).isEqualTo("the-id")
        assertThat(diag.timestampMillis).isEqualTo(42L)
        assertThat(diag.kind).isEqualTo(CrashKind.EXCEPTION)
    }

    @Test
    fun fromThrowable_includesCauseInDetails() {
        val cause = IllegalStateException("root cause")
        val diag = CrashDiagnosticFactory.fromThrowable(
            RuntimeException("wrapper", cause),
            id = "id-4",
            timestampMillis = 1L,
        )

        assertThat(diag.details).contains("Caused by")
        assertThat(diag.details).contains("root cause")
    }
}
