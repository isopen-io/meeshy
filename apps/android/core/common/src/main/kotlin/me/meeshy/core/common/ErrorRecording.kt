package me.meeshy.core.common

import timber.log.Timber

public enum class ErrorCategory { DATABASE, NETWORK, CACHE, SOCKET, MEDIA, SERIALIZATION, GENERAL }

public data class RecordedFailure(
    val context: String,
    val category: ErrorCategory,
    val errorType: String,
    val message: String,
)

public fun interface ErrorRecording {
    public fun record(failure: RecordedFailure)
}

public object TimberErrorRecorder : ErrorRecording {
    override fun record(failure: RecordedFailure) {
        Timber.tag(failure.category.name).e("%s failed: %s %s", failure.context, failure.errorType, failure.message)
    }
}

public class CompositeErrorRecorder(private val recorders: List<ErrorRecording>) : ErrorRecording {
    override fun record(failure: RecordedFailure) {
        recorders.forEach { recorder -> runCatching { recorder.record(failure) } }
    }
}

public fun Throwable.toRecordedFailure(context: String, category: ErrorCategory): RecordedFailure =
    RecordedFailure(
        context = context,
        category = category,
        errorType = this::class.java.simpleName.ifEmpty { this::class.java.name },
        message = message.orEmpty(),
    )

public object ErrorRecorders {
    @Volatile
    public var current: ErrorRecording = TimberErrorRecorder
}
