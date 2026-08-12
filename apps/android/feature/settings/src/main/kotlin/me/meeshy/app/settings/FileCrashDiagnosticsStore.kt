package me.meeshy.app.settings

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.diagnostics.CrashDiagnostic
import me.meeshy.sdk.model.diagnostics.CrashReportRetention
import me.meeshy.sdk.model.diagnostics.crashReportsFromStorage
import me.meeshy.sdk.model.diagnostics.storageValue
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * File-system backed [CrashDiagnosticsStore]. Persists the whole crash list as a single JSON file
 * under `filesDir/diagnostics/crash_reports.json`, applying the pure [CrashReportRetention] cap on
 * every append and read so a crash loop can never grow the file without bound.
 *
 * [record] is synchronous and `@Synchronized` because its production caller is the default
 * uncaught-exception handler running on the dying thread — a read-modify-write under a monitor is the
 * safe, allocation-light way to append at that moment. [reports]/[clear] run on [Dispatchers.IO].
 * This is coverage-exempt I/O glue; the tested logic is the pure retention/codec in `:core:model`.
 */
@Singleton
class FileCrashDiagnosticsStore @Inject constructor(
    @ApplicationContext context: Context,
) : CrashDiagnosticsStore {

    private val file: File = File(File(context.filesDir, DIRECTORY).apply { mkdirs() }, FILE_NAME)

    override suspend fun reports(): List<CrashDiagnostic> = withContext(Dispatchers.IO) {
        CrashReportRetention.retained(readAll())
    }

    @Synchronized
    override fun record(diagnostic: CrashDiagnostic) {
        val next = CrashReportRetention.retained(readAll() + diagnostic)
        runCatching { file.writeText(next.storageValue) }
    }

    override suspend fun clear(): Unit = withContext(Dispatchers.IO) {
        runCatching { file.delete() }
        Unit
    }

    private fun readAll(): List<CrashDiagnostic> =
        crashReportsFromStorage(runCatching { if (file.exists()) file.readText() else null }.getOrNull())

    private companion object {
        const val DIRECTORY = "diagnostics"
        const val FILE_NAME = "crash_reports.json"
    }
}
