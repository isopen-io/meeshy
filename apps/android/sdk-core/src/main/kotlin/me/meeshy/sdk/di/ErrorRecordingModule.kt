package me.meeshy.sdk.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import me.meeshy.core.common.CompositeErrorRecorder
import me.meeshy.core.common.ErrorCategory
import me.meeshy.core.common.ErrorRecorders
import me.meeshy.core.common.ErrorRecording
import me.meeshy.core.common.RecordedFailure
import me.meeshy.core.common.TimberErrorRecorder
import me.meeshy.sdk.model.util.SerializationFailureSink
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ErrorRecordingExtensionsModule {
    /** Extra recorders (crash diagnostics, analytics) contribute here with @IntoSet. */
    @Multibinds
    abstract fun extraRecorders(): Set<@JvmSuppressWildcards ErrorRecording>
}

@Module
@InstallIn(SingletonComponent::class)
internal object ErrorRecordingModule {
    @Provides
    @Singleton
    fun provideErrorRecording(extra: Set<@JvmSuppressWildcards ErrorRecording>): ErrorRecording =
        CompositeErrorRecorder(listOf(TimberErrorRecorder) + extra).also { ErrorRecorders.current = it }

    @Provides
    @Singleton
    fun provideSerializationFailureSink(recording: ErrorRecording): SerializationFailureSink =
        SerializationFailureSink { failure ->
            recording.record(
                RecordedFailure(
                    context = "${failure.direction} ${failure.field} [id=${failure.id}]",
                    category = ErrorCategory.SERIALIZATION,
                    errorType = failure.errorType,
                    message = failure.message,
                ),
            )
        }
}
