package me.meeshy.sdk.story

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
public abstract class StoryCoverCacheModule {
    @Binds
    public abstract fun bindCoverStore(impl: StoryCoverCache): StoryCoverStore

    @Binds
    @IntoSet
    public abstract fun bindCoverAccountCache(impl: StoryCoverCache): PerAccountCache
}
