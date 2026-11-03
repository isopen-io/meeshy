package me.meeshy.app.settings

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.cache.purge.CacheMediaDisks
import javax.inject.Singleton

/** Binds the file-system backed [AndroidMediaCacheStore] as the [MediaCacheStore] the VM injects. */
@Module
@InstallIn(SingletonComponent::class)
abstract class MediaCacheModule {

    @Binds
    @Singleton
    abstract fun bindsMediaCacheStore(impl: AndroidMediaCacheStore): MediaCacheStore

    /** Les stockages disque par clé que le service de purge sélective mesure et vide. */
    @Binds
    @Singleton
    abstract fun bindsCacheMediaDisks(impl: AndroidMediaCacheStore): CacheMediaDisks
}
