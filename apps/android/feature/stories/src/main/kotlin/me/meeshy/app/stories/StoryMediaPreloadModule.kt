package me.meeshy.app.stories

import android.content.Context
import coil.imageLoader
import coil.request.ImageRequest
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import me.meeshy.sdk.media.AttachmentDownloadCenter
import me.meeshy.sdk.media.MediaDownloadPreferencesStore
import me.meeshy.sdk.media.NetworkConditionMonitor
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryMediaStoreRouter
import me.meeshy.sdk.model.mediacache.MediaTransferProfile
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.story.StoryMediaFetcher
import me.meeshy.sdk.story.StoryMediaPreloader
import me.meeshy.sdk.util.resolveMediaUrl
import javax.inject.Singleton

/**
 * Le préchargeur du plateau câblé sur les magasins du produit : les images chauffent le cache de Coil (celui que le
 * lecteur relit), la vidéo et l'audio passent par le registre de téléchargement en préchargement différable. La
 * politique a déjà autorisé l'appel quand le tireur est invoqué.
 */
@Module
@InstallIn(SingletonComponent::class)
object StoryMediaPreloadModule {
    @Provides
    @Singleton
    fun providesStoryMediaPreloader(
        @ApplicationContext context: Context,
        network: NetworkConditionMonitor,
        preferences: MediaDownloadPreferencesStore,
        center: AttachmentDownloadCenter,
        config: MeeshyConfig,
    ): StoryMediaPreloader = StoryMediaPreloader(
        network = network,
        preferences = preferences,
        fetcher = object : StoryMediaFetcher {
            override suspend fun fetch(url: String, kind: FeedMediaType) {
                val resolved = resolveMediaUrl(url, config.apiBaseUrl)
                if (kind == FeedMediaType.VIDEO || kind == FeedMediaType.AUDIO) {
                    center.prefetch(resolved, 0L, StoryMediaStoreRouter.category(kind), MediaTransferProfile.prefetch(meteredAllowed = true))
                } else {
                    context.imageLoader.execute(ImageRequest.Builder(context).data(resolved).build())
                }
            }
        },
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    )
}
