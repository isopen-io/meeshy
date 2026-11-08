package me.meeshy.sdk.media

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Singleton

/** Résolveur de disponibilité et auto-démarrage des médias, au graphe. */
@Module
@InstallIn(SingletonComponent::class)
object MediaAvailabilityModule {
    @Provides
    @Singleton
    fun providesMediaAvailabilityResolver(center: AttachmentDownloadCenter, network: NetworkConditionMonitor): MediaAvailabilityResolver =
        MediaAvailabilityResolver(center, network, CoroutineScope(SupervisorJob() + Dispatchers.Default))

    @Provides
    @Singleton
    fun providesAutoDownloadStarter(
        center: AttachmentDownloadCenter,
        preferences: MediaDownloadPreferencesStore,
        network: NetworkConditionMonitor,
    ): AutoDownloadStarter = AutoDownloadStarter(center, preferences, network)
}
