package me.meeshy.app.settings

import me.meeshy.sdk.model.diagnostics.CrashDiagnostic

/**
 * Reads, appends, and clears persisted crash diagnostics. [record] is **synchronous** because its
 * one production caller is the default uncaught-exception handler, which runs on the crashing thread
 * while the process is being torn down — there is no time to hop to a coroutine. [reports] and
 * [clear] are the viewer's suspending reads/writes, run off the main thread.
 *
 * Product-side orchestration (it owns the concrete on-disk layout) — kept out of the SDK per the
 * purity rule; the pure retention/format/codec arithmetic lives in `:core:model`.
 */
interface CrashDiagnosticsStore {

    /** Persisted incidents, newest-first and capped (retention applied by the implementation). */
    suspend fun reports(): List<CrashDiagnostic>

    /** Append one incident synchronously, applying the retention cap. Safe from the crashing thread. */
    fun record(diagnostic: CrashDiagnostic)

    /** Delete every persisted incident. */
    suspend fun clear()
}
