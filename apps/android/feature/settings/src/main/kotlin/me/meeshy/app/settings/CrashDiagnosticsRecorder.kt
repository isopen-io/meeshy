package me.meeshy.app.settings

import me.meeshy.sdk.model.diagnostics.CrashDiagnosticFactory
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Installs the process-wide uncaught-exception capture — the Android analogue of the iOS
 * `NSSetUncaughtExceptionHandler` path. On an uncaught JVM exception it persists a [CrashDiagnostic]
 * via the store's synchronous [CrashDiagnosticsStore.record] (the crashing thread is dying, so there
 * is no coroutine hop), then chains to whatever handler was installed before us so we never clobber a
 * sibling reporter or the OS default. Coverage-exempt glue: the testable decision — turning a
 * [Throwable] into a diagnostic — lives in the pure [CrashDiagnosticFactory].
 */
@Singleton
class CrashDiagnosticsRecorder @Inject constructor(
    private val store: CrashDiagnosticsStore,
) {

    fun install() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            runCatching {
                store.record(
                    CrashDiagnosticFactory.fromThrowable(
                        throwable = throwable,
                        id = UUID.randomUUID().toString(),
                        timestampMillis = System.currentTimeMillis(),
                    ),
                )
            }
            previous?.uncaughtException(thread, throwable)
        }
    }
}
