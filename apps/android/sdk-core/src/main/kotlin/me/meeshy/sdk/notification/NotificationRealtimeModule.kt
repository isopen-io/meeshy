package me.meeshy.sdk.notification

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber

@Module
@InstallIn(SingletonComponent::class)
internal abstract class NotificationRealtimeModule {
    @Binds
    @IntoSet
    abstract fun ingest(pipeline: NotificationIngestPipeline): RealtimeBinding

    @Binds
    @IntoSet
    abstract fun gapResync(coordinator: NotificationGapResyncCoordinator): RealtimeBinding

    companion object {
        @Provides
        fun runner(repository: NotificationRepository): NotificationResyncRunner =
            NotificationResyncRunner {
                repository.resync()?.let { Timber.w("Relecture des notifications en échec (%s)", it.javaClass.simpleName) }
            }
    }
}
