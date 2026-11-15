package me.meeshy.sdk.media

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.story.StoryMediaPins
import me.meeshy.sdk.util.resolveMediaUrl
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object MediaPinStoresModule {
    @Provides
    @Singleton
    fun providesMediaPinStores(@ApplicationContext context: Context): MediaPinStores =
        MediaPinStores(MediaCacheDirs(context.cacheDir, context.cacheDir))

    @Provides
    @Singleton
    fun providesStoryMediaPins(stores: MediaPinStores, config: MeeshyConfig): StoryMediaPins =
        StoryMediaPins(stores, resolve = { resolveMediaUrl(it, config.apiBaseUrl) })
}
