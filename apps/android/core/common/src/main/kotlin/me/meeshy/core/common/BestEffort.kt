package me.meeshy.core.common

import kotlin.coroutines.cancellation.CancellationException

public inline fun <T> bestEffort(
    context: String,
    category: ErrorCategory = ErrorCategory.DATABASE,
    recorder: ErrorRecording = ErrorRecorders.current,
    operation: () -> T,
): T? = try {
    operation()
} catch (cancellation: CancellationException) {
    throw cancellation
} catch (error: Throwable) {
    runCatching { recorder.record(error.toRecordedFailure(context, category)) }
    null
}

public inline fun <T> bestEffortOr(
    context: String,
    fallback: T,
    category: ErrorCategory = ErrorCategory.DATABASE,
    recorder: ErrorRecording = ErrorRecorders.current,
    operation: () -> T,
): T = bestEffort(context, category, recorder, operation) ?: fallback
