package me.meeshy.sdk.media

import android.content.Context
import dagger.BindsOptionalOf
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import me.meeshy.sdk.net.MediaDownloadClient
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.util.resolveMediaUrl
import okhttp3.OkHttpClient
import java.util.Optional
import javax.inject.Singleton

/**
 * Le registre des téléchargements de médias au graphe : cache typé borné, entonnoir réseau (client OkHttp DÉDIÉ aux
 * médias), registre unique, préchargement et adoption à l'accusé. Les haptiques sont optionnelles : l'app peut lier un
 * [DownloadHaptics] ; sans lui le registre reste muet.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class MediaModule {

    @BindsOptionalOf
    abstract fun optionalDownloadHaptics(): DownloadHaptics

    @dagger.Binds
    abstract fun bindsDeferredScheduler(impl: WorkManagerDeferredMediaScheduler): DeferredMediaScheduler

    companion object {
        @Provides
        @Singleton
        fun providesTypedMediaCache(@ApplicationContext context: Context, pinStores: MediaPinStores): TypedMediaCache =
            TypedMediaCache(MediaCacheDirs(context.cacheDir, context.cacheDir), pins = { pinStores.tableOf(it) }).also { it.sweepStaging() }

        @Provides
        @Singleton
        fun providesOwnedMediaRoots(@ApplicationContext context: Context): OwnedMediaRoots =
            OwnedMediaRoots(listOf(context.filesDir, context.cacheDir))

        @Provides
        @Singleton
        fun providesMediaFetcher(cache: TypedMediaCache, @MediaDownloadClient client: OkHttpClient): MediaFetcher =
            MediaFetcher(cache, MediaFileDownloader(client), CoroutineScope(SupervisorJob() + Dispatchers.IO))

        @Provides
        @Singleton
        fun providesAttachmentDownloadCenter(
            fetcher: MediaFetcher,
            cache: TypedMediaCache,
            config: MeeshyConfig,
            haptics: Optional<DownloadHaptics>,
        ): AttachmentDownloadCenter = AttachmentDownloadCenter(
            fetcher = fetcher,
            cache = cache,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
            keyOf = { resolveMediaUrl(it, config.apiBaseUrl) },
            haptics = haptics.orElse(DownloadHaptics.None),
        )
    }
}
