package me.meeshy.sdk.story

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
abstract class MyStoriesArchiveCacheModule {
    @Binds
    abstract fun bindArchiveCache(impl: InMemoryMyStoriesArchiveCache): MyStoriesArchiveCache

    @Binds
    @IntoSet
    abstract fun bindArchiveAccountCache(impl: InMemoryMyStoriesArchiveCache): PerAccountCache
}
